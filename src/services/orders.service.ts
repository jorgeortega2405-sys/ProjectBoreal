import { pool } from '../config/database.config.js';
import { deleteCache, deleteCachePattern, getCache, publishGiveawayEvent, setCache } from '../config/redis.config.js';
import { BankAccount, Order } from '../types/order.types.js';
import { normalizeMexicanPhone } from '../utils/phone.util.js';
import { recordAudit } from './audit.service.js';
import { logger } from './logger.service.js';
import crypto from 'crypto';
import { ResultSetHeader, RowDataPacket } from 'mysql2/promise';

interface OrderRow extends RowDataPacket, Omit<Order, 'ticket_numbers'> {
  ticket_numbers: string | number[];
}

interface TicketRow extends RowDataPacket {
  status: 'available' | 'reserved' | 'paid';
  ticket_number: number;
}

export async function getActiveBankAccounts(giveawayIdOrUuid?: number | string): Promise<BankAccount[]> {
  try {
    const cacheKey = giveawayIdOrUuid ? `bank_accounts:${giveawayIdOrUuid}` : 'bank_accounts';
    const cached = await getCache<BankAccount[]>(cacheKey);
    if (cached) return cached;

    let query: string;
    let params: unknown[];

    if (giveawayIdOrUuid !== undefined && giveawayIdOrUuid !== null && giveawayIdOrUuid !== '') {
      query = `SELECT ba.id, ba.uuid, ba.bank_name, ba.account_holder, ba.account_type, ba.clabe, ba.account_number, ba.card_number, ba.currency, ba.is_active, ba.created_at, ba.updated_at
       FROM giveaway_bank_accounts gba
       INNER JOIN bank_accounts ba ON ba.id = gba.bank_account_id
       INNER JOIN giveaways g ON g.id = gba.giveaway_id
       WHERE (g.id = ? OR g.uuid = ?) AND gba.is_active = 1 AND ba.is_active = 1
       ORDER BY ba.id ASC`;
      params = [giveawayIdOrUuid, String(giveawayIdOrUuid)];
    } else {
      query = `SELECT id, uuid, bank_name, account_holder, account_type, clabe, account_number, card_number, currency, is_active, created_at, updated_at
       FROM bank_accounts
       WHERE is_active = 1
       ORDER BY id ASC`;
      params = [];
    }

    const [rows] = await pool.query<(RowDataPacket & BankAccount)[]>(query, params);

    if (giveawayIdOrUuid && rows.length === 0) {
      const [fallbackRows] = await pool.query<(RowDataPacket & BankAccount)[]>(
        `SELECT id, uuid, bank_name, account_holder, account_type, clabe, account_number, card_number, currency, is_active, created_at, updated_at
         FROM bank_accounts
         WHERE is_active = 1
         ORDER BY id ASC`
      );
      await setCache(cacheKey, fallbackRows, 3600);
      return fallbackRows;
    }

    await setCache(cacheKey, rows, 3600);
    return rows;
  } catch (error) {
    logger.db.error('Error al obtener cuentas bancarias activas', error);
    return [];
  }
}


export async function reserveTickets(data: {
  customerName: string;
  customerPhone: string;
  customerState?: string;
  giveawayUuid: string;
  ipAddress?: string;
  ticketNumbers: number[];
  userAgent?: string;
}): Promise<{
  bankAccounts: BankAccount[];
  error?: string;
  order?: Order;
  salesClosed?: boolean;
  success: boolean;
  unavailableTickets?: number[];
}> {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [giveaways] = await conn.query<RowDataPacket[]>(
      `SELECT id, title, ticket_price, currency, status, total_tickets, end_date, start_date, min_threshold_pct, threshold_reached_at,
              package_options, type,
              (NOW() >= DATE_SUB(end_date, INTERVAL 1 HOUR)) AS is_sales_closed,
              (start_date IS NOT NULL AND NOW() < start_date) AS is_not_started
       FROM giveaways
       WHERE uuid = ?
       LIMIT 1`,
      [data.giveawayUuid]
    );

    if (giveaways.length === 0) {
      await conn.rollback();
      return { bankAccounts: [], success: false };
    }

    const giveaway = giveaways[0];
    if (giveaway.status !== 'active') {
      await conn.rollback();
      return { bankAccounts: [], success: false };
    }

    if (Boolean(giveaway.is_not_started)) {
      await conn.rollback();
      return {
        bankAccounts: [],
        error: 'La venta de boletos aún no ha comenzado para este sorteo.',
        success: false,
      };
    }

    if (Boolean(giveaway.is_sales_closed) && (giveaway.min_threshold_pct === 0 || Boolean(giveaway.threshold_reached_at))) {
      await conn.rollback();
      return {
        bankAccounts: [],
        error: 'La venta de boletos ha finalizado para este sorteo (menos de 1 hora restante).',
        salesClosed: true,
        success: false,
      };
    }

    const cleanNumbers = Array.from(new Set(data.ticketNumbers)).filter(
      (n) => Number.isInteger(n) && n >= 1 && n <= giveaway.total_tickets
    );

    if (cleanNumbers.length === 0) {
      await conn.rollback();
      return { bankAccounts: [], success: false };
    }

    const packageOpts = giveaway.package_options
      ? (typeof giveaway.package_options === 'string' ? JSON.parse(giveaway.package_options) : giveaway.package_options)
      : [];
    const maxByTotal = Math.max(10, Math.floor(giveaway.total_tickets * 0.20));
    const maxAllowed = Math.max(1, maxByTotal);

    if (cleanNumbers.length > maxAllowed) {
      await conn.rollback();
      return {
        bankAccounts: [],
        error: `No puedes apartar más de ${maxAllowed} boletos en una sola orden.`,
        success: false,
      };
    }

    const normalizedPhone = normalizeMexicanPhone(data.customerPhone) || data.customerPhone.trim();
    const rawPhoneDigits = data.customerPhone.replace(/\D/g, '');
    const phoneCandidates = Array.from(new Set([normalizedPhone, rawPhoneDigits, data.customerPhone.trim()])).filter(Boolean);

    const [pendingOrders] = await conn.query<RowDataPacket[]>(
      `SELECT COUNT(*) AS active_count
       FROM orders
       WHERE customer_phone IN (?)
         AND status = 'pending_payment' AND expires_at > NOW()`,
      [phoneCandidates]
    );

    if (pendingOrders.length > 0 && pendingOrders[0].active_count >= 2) {
      await conn.rollback();
      return {
        bankAccounts: [],
        error: 'Ya tienes órdenes pendientes de pago activas. Por favor liquídalas o espera a que concluyan antes de apartar nuevos boletos.',
        success: false,
      };
    }

    const [existingTickets] = await conn.query<TicketRow[]>(
      `SELECT ticket_number, status, reserved_until
       FROM giveaway_tickets
       WHERE giveaway_id = ? AND ticket_number IN (?)
       FOR UPDATE`,
      [giveaway.id, cleanNumbers]
    );

    const unavailable: number[] = [];
    const now = new Date();

    for (const t of existingTickets) {
      if (t.status === 'paid') {
        unavailable.push(t.ticket_number);
      } else if (t.status === 'reserved' && t.reserved_until && new Date(t.reserved_until) > now) {
        unavailable.push(t.ticket_number);
      }
    }

    if (unavailable.length > 0) {
      await conn.rollback();
      return {
        bankAccounts: [],
        success: false,
        unavailableTickets: unavailable,
      };
    }

    const orderUuid = crypto.randomUUID();
    const conceptReference = data.customerName.trim().replace(/\s+/g, ' ').toUpperCase();
    const ticketCount = cleanNumbers.length;
    const totalAmount = ticketCount * Number(giveaway.ticket_price);
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

    const [orderResult] = await conn.query<ResultSetHeader>(
      `INSERT INTO orders (
        uuid, giveaway_id, customer_name, customer_phone, customer_state, ticket_count, ticket_numbers,
        total_amount, currency, concept_reference, status, expires_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending_payment', ?)`,
      [
        orderUuid,
        giveaway.id,
        data.customerName.trim(),
        normalizedPhone,
        data.customerState ? data.customerState.trim() : null,
        ticketCount,
        JSON.stringify(cleanNumbers),
        totalAmount,
        giveaway.currency,
        conceptReference,
        expiresAt,
      ]
    );

    const orderId = orderResult.insertId;

    const ticketValues = cleanNumbers.map((num) => [
      giveaway.id,
      num,
      orderId,
      'reserved',
      expiresAt,
    ]);

    await conn.query(
      `INSERT INTO giveaway_tickets (giveaway_id, ticket_number, order_id, status, reserved_until)
       VALUES ?
       ON DUPLICATE KEY UPDATE
         status = 'reserved',
         order_id = VALUES(order_id),
         reserved_until = VALUES(reserved_until)`,
      [ticketValues]
    );

    const [updateRes] = await conn.query<ResultSetHeader>(
      `UPDATE giveaways
       SET available_tickets = GREATEST(0, available_tickets - ?)
       WHERE id = ? AND available_tickets >= ?`,
      [ticketCount, giveaway.id, ticketCount]
    );

    if (updateRes.affectedRows === 0) {
      await conn.rollback();
      return {
        bankAccounts: [],
        error: 'No hay suficientes boletos disponibles para completar esta orden.',
        success: false,
      };
    }

    await conn.commit();

    await deleteCache(`giveaway:${data.giveawayUuid}:tickets`);
    await deleteCache(`giveaway:${data.giveawayUuid}`);
    await deleteCache('giveaways:active');

    await publishGiveawayEvent('boreal:giveaways', {
      giveaway_uuid: data.giveawayUuid,
      ticket_numbers: cleanNumbers,
      type: 'TICKETS_RESERVED',
    });

    const bankAccounts = await getActiveBankAccounts(giveaway.id);

    await recordAudit({
      action: 'ORDER_RESERVED',
      actor_type: 'customer',
      amount: totalAmount,
      currency: giveaway.currency,
      customer_name: data.customerName.trim(),
      customer_phone: normalizedPhone,
      details: {
        concept_reference: conceptReference,
        expires_at: expiresAt.toISOString(),
        giveaway_id: giveaway.id,
        giveaway_uuid: data.giveawayUuid,
        ticket_count: ticketCount,
        ticket_numbers: cleanNumbers,
      },
      ip_address: data.ipAddress,
      new_status: 'pending_payment',
      order_id: orderId,
      order_uuid: orderUuid,
      previous_status: null,
      user_agent: data.userAgent,
    });

    const createdOrder: Order = {
      bank_reference: null,
      concept_reference: conceptReference,
      created_at: new Date().toISOString(),
      currency: giveaway.currency,
      customer_name: data.customerName.trim(),
      customer_phone: normalizedPhone,
      expires_at: expiresAt.toISOString(),
      giveaway_id: giveaway.id,
      giveaway_title: giveaway.title,
      giveaway_uuid: data.giveawayUuid,
      id: orderId,
      receipt_url: null,
      status: 'pending_payment',
      ticket_count: ticketCount,
      ticket_numbers: cleanNumbers,
      total_amount: totalAmount,
      tracking_key: null,
      updated_at: new Date().toISOString(),
      uuid: orderUuid,
    };

    return {
      bankAccounts,
      order: createdOrder,
      success: true,
    };
  } catch (error) {
    await conn.rollback();
    logger.db.error('Error al apartar boletos en transacción MySQL', error);
    throw new Error('Error al apartar boletos');
  } finally {
    conn.release();
  }
}

export async function getOrdersByPhone(phone: string): Promise<Order[]> {
  try {
    const cleanPhone = normalizeMexicanPhone(phone) || phone.trim();
    const rawDigits = phone.replace(/\D/g, '');
    const phoneCandidates = Array.from(new Set([cleanPhone, rawDigits, phone.trim()])).filter(Boolean);

    const [rows] = await pool.query<OrderRow[]>(
      `SELECT o.id, o.uuid, o.giveaway_id, o.customer_name, o.customer_phone, o.customer_state,
              o.ticket_count, o.ticket_numbers,
              CAST(o.total_amount AS DOUBLE) AS total_amount,
              o.currency, o.concept_reference, o.status, o.expires_at,
              o.receipt_url, o.tracking_key, o.bank_reference, o.is_winner, o.created_at, o.updated_at,
              g.title AS giveaway_title, g.uuid AS giveaway_uuid, g.status AS giveaway_status,
              g.winner_ticket_number, g.winner_name
       FROM orders o
       INNER JOIN giveaways g ON o.giveaway_id = g.id
       WHERE o.customer_phone IN (?)
       ORDER BY o.created_at DESC`,
      [phoneCandidates]
    );

    return rows.map((r) => ({
      ...r,
      ticket_numbers: typeof r.ticket_numbers === 'string' ? JSON.parse(r.ticket_numbers) : r.ticket_numbers,
    }));
  } catch (error) {
    logger.db.error('Error al consultar órdenes por teléfono', error);
    throw new Error('Error al consultar historial de boletos');
  }
}

export async function getOrderByUuid(orderUuid: string): Promise<Order | null> {
  try {
    const [rows] = await pool.query<OrderRow[]>(
      `SELECT o.id, o.uuid, o.giveaway_id, o.customer_name, o.customer_phone, o.customer_state,
              o.ticket_count, o.ticket_numbers,
              CAST(o.total_amount AS DOUBLE) AS total_amount,
              o.currency, o.concept_reference, o.status, o.expires_at,
              o.receipt_url, o.receipt_filename, o.tracking_key, o.bank_reference, o.is_winner, o.created_at, o.updated_at,
              g.title AS giveaway_title, g.uuid AS giveaway_uuid, g.status AS giveaway_status,
              g.winner_ticket_number, g.winner_name
       FROM orders o
       INNER JOIN giveaways g ON o.giveaway_id = g.id
       WHERE o.uuid = ?
       LIMIT 1`,
      [orderUuid]
    );

    if (rows.length === 0) return null;
    const r = rows[0];
    return {
      ...r,
      ticket_numbers: typeof r.ticket_numbers === 'string' ? JSON.parse(r.ticket_numbers) : r.ticket_numbers,
    };
  } catch (error) {
    logger.db.error('Error al consultar orden por UUID', error);
    throw new Error('Error al consultar la orden');
  }
}

export async function attachReceipt(data: {
  bankReference?: string;
  ipAddress?: string;
  orderUuid: string;
  receiptFilename?: string;
  receiptUrl: string;
  trackingKey?: string;
  userAgent?: string;
}): Promise<Order | null> {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [rows] = await conn.query<RowDataPacket[]>(
      `SELECT o.id, o.uuid, o.giveaway_id, o.customer_name, o.customer_phone,
              o.ticket_count, o.ticket_numbers, o.total_amount, o.currency, o.status, o.expires_at,
              g.uuid AS giveaway_uuid
       FROM orders o
       INNER JOIN giveaways g ON o.giveaway_id = g.id
       WHERE o.uuid = ?
       LIMIT 1
       FOR UPDATE`,
      [data.orderUuid]
    );

    if (rows.length === 0) {
      await conn.rollback();
      return null;
    }

    const order = rows[0] as OrderRow;
    if (order.status === 'completed' || order.status === 'cancelled') {
      await conn.rollback();
      return await getOrderByUuid(data.orderUuid);
    }

    const now = new Date();
    const isExpired = order.status === 'expired' || (order.status === 'pending_payment' && new Date(order.expires_at) < now);
    if (isExpired) {
      await conn.rollback();
      throw new Error('ORDER_EXPIRED');
    }

    const trackingKey = data.trackingKey?.trim() ? data.trackingKey.trim().toUpperCase() : null;
    if (trackingKey) {
      const [existingOrder] = await conn.query<RowDataPacket[]>(
        `SELECT id FROM orders WHERE tracking_key = ? AND id != ? AND status IN ('completed', 'in_review') LIMIT 1`,
        [trackingKey, order.id]
      );
      if (existingOrder.length > 0) {
        await conn.rollback();
        throw new Error('DUPLICATE_TRACKING_KEY');
      }
    }

    const bankRef = data.bankReference?.trim() || null;
    const reviewGracePeriod = new Date(Date.now() + 48 * 3600 * 1000);

    await conn.query(
      `UPDATE orders
       SET status = 'in_review', receipt_url = ?, receipt_filename = ?, tracking_key = ?, bank_reference = ?
       WHERE id = ?`,
      [data.receiptUrl, data.receiptFilename || null, trackingKey, bankRef, order.id]
    );

    const tickets: number[] = typeof order.ticket_numbers === 'string'
      ? JSON.parse(order.ticket_numbers)
      : order.ticket_numbers;

    if (tickets && tickets.length > 0) {
      await conn.query(
        `UPDATE giveaway_tickets
         SET reserved_until = ?
         WHERE order_id = ? AND status = 'reserved'`,
        [reviewGracePeriod, order.id]
      );
    }

    await conn.query(
      `INSERT INTO spei_validation_queue (
        order_id, tracking_key, expected_amount, attempts, max_attempts, next_retry_at, status
      ) VALUES (?, ?, ?, 0, 6, NOW(), 'pending')
      ON DUPLICATE KEY UPDATE tracking_key = COALESCE(VALUES(tracking_key), tracking_key), next_retry_at = NOW(), status = 'pending'`,
      [order.id, trackingKey || 'PENDING_OCR', order.total_amount]
    );

    await conn.commit();

    await publishGiveawayEvent('boreal:queue:new_receipt', {
      order_id: order.id,
      order_uuid: data.orderUuid,
      tracking_key: trackingKey || null,
    });

    if (order.giveaway_uuid) {
      await deleteCache(`giveaway:${order.giveaway_uuid}:tickets`);
    }

    await recordAudit({
      action: 'RECEIPT_ATTACHED',
      actor_type: 'customer',
      amount: order.total_amount,
      currency: order.currency,
      customer_name: order.customer_name,
      customer_phone: order.customer_phone,
      details: {
        bank_reference: bankRef,
        receipt_filename: data.receiptFilename || null,
        receipt_url: data.receiptUrl,
        tracking_key: trackingKey,
      },
      ip_address: data.ipAddress,
      new_status: 'in_review',
      order_id: order.id,
      order_uuid: order.uuid,
      previous_status: order.status,
      user_agent: data.userAgent,
    });

    if (trackingKey) {
      await recordAudit({
        action: 'SPEI_KEY_SUBMITTED',
        actor_type: 'customer',
        amount: order.total_amount,
        currency: order.currency,
        customer_name: order.customer_name,
        customer_phone: order.customer_phone,
        details: {
          tracking_key: trackingKey,
        },
        ip_address: data.ipAddress,
        new_status: 'in_review',
        order_id: order.id,
        order_uuid: order.uuid,
        previous_status: order.status,
        user_agent: data.userAgent,
      });
    }

    return await getOrderByUuid(data.orderUuid);
  } catch (error) {
    await conn.rollback();
    if ((error as Error).message === 'ORDER_EXPIRED' || (error as Error).message === 'DUPLICATE_TRACKING_KEY') {
      throw error;
    }
    if ((error as any)?.code === 'ER_DUP_ENTRY') {
      throw new Error('DUPLICATE_TRACKING_KEY');
    }
    logger.db.error('Error al asociar comprobante a la orden', error);
    throw new Error('Error al registrar el comprobante de pago');
  } finally {
    conn.release();
  }
}

export async function releaseExpiredReservations(): Promise<number> {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [expiredOrders] = await conn.query<RowDataPacket[]>(
      `SELECT id, uuid, giveaway_id, customer_name, customer_phone, ticket_count, ticket_numbers, total_amount, currency
       FROM orders
       WHERE status = 'pending_payment' AND expires_at < NOW() AND receipt_url IS NULL
       FOR UPDATE`
    );

    if (expiredOrders.length === 0) {
      await conn.rollback();
      return 0;
    }

    const orderIds = expiredOrders.map((o) => o.id);

    await conn.query(
      `UPDATE orders
       SET status = 'expired'
       WHERE id IN (?)`,
      [orderIds]
    );

    const [ticketResult] = await conn.query<ResultSetHeader>(
      `UPDATE giveaway_tickets
       SET status = 'available', order_id = NULL, reserved_until = NULL
       WHERE order_id IN (?) AND status = 'reserved'`,
      [orderIds]
    );

    const giveawayCounts = new Map<number, number>();
    for (const order of expiredOrders) {
      const gId = order.giveaway_id;
      const count = order.ticket_count || 1;
      giveawayCounts.set(gId, (giveawayCounts.get(gId) || 0) + count);
    }
    for (const [giveawayId, count] of giveawayCounts.entries()) {
      await conn.query(
        `UPDATE giveaways SET available_tickets = LEAST(total_tickets, available_tickets + ?) WHERE id = ?`,
        [count, giveawayId]
      );
    }

    await conn.commit();

    for (const expOrder of expiredOrders) {
      const tickets: number[] = typeof expOrder.ticket_numbers === 'string'
        ? JSON.parse(expOrder.ticket_numbers)
        : expOrder.ticket_numbers;
      await recordAudit({
        action: 'ORDER_EXPIRED',
        actor_type: 'system',
        amount: expOrder.total_amount !== null ? Number(expOrder.total_amount) : null,
        currency: expOrder.currency,
        customer_name: expOrder.customer_name,
        customer_phone: expOrder.customer_phone,
        details: {
          released_tickets: tickets,
          ticket_count: expOrder.ticket_count,
        },
        ip_address: '127.0.0.1',
        new_status: 'expired',
        order_id: Number(expOrder.id),
        order_uuid: expOrder.uuid,
        previous_status: 'pending_payment',
        user_agent: 'ProjectBoreal/SystemCron',
      });
    }

    const released = ticketResult.affectedRows || 0;
    if (released > 0) {
      await deleteCachePattern('giveaway:*:tickets');
      await deleteCache('giveaways:active');
      const allReleasedTicketNumbers: number[] = [];
      for (const expOrder of expiredOrders) {
        const tickets: number[] = typeof expOrder.ticket_numbers === 'string'
          ? JSON.parse(expOrder.ticket_numbers)
          : expOrder.ticket_numbers;
        if (Array.isArray(tickets)) {
          allReleasedTicketNumbers.push(...tickets);
        }
      }
      await publishGiveawayEvent('boreal:giveaways', {
        released_count: released,
        ticket_numbers: allReleasedTicketNumbers,
        type: 'TICKETS_RELEASED',
      });
      logger.db.info(`Se liberaron ${released} boletos de órdenes expiradas.`);
    }
    return released;
  } catch (error) {
    await conn.rollback();
    logger.db.error('Error al liberar reservaciones expiradas', error);
    return 0;
  } finally {
    conn.release();
  }
}
