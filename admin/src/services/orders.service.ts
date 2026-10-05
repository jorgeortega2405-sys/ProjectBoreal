import crypto from 'crypto';
import { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { pool } from '../config/database.config.js';
import { config } from '../config/env.config.js';
import { deleteCache, deleteCachePattern, publishGiveawayEvent } from '../config/redis.config.js';
import { AdminOrder, OrderStatus, SpeiQueueItem } from '../types/order.types.js';
import { logAdminAudit } from './auth.service.js';
import { logger } from './logger.service.js';

interface OrderRow extends RowDataPacket {
  bank_reference: string | null;
  concept_reference: string;
  created_at: Date | string;
  currency: string;
  customer_name: string;
  customer_phone: string;
  expires_at: Date | string;
  giveaway_id: number;
  giveaway_slug: string;
  giveaway_title: string;
  giveaway_uuid: string;
  id: number;
  is_winner: number;
  receipt_filename: string | null;
  receipt_url: string | null;
  status: OrderStatus;
  ticket_count: number;
  ticket_numbers: string | number[];
  total_amount: number;
  tracking_key: string | null;
  updated_at: Date | string;
  uuid: string;
}

interface SpeiRow extends RowDataPacket {
  attempts: number;
  banxico_response: string | Record<string, unknown> | null;
  created_at: Date | string;
  customer_name: string;
  customer_phone: string;
  expected_amount: number;
  giveaway_title: string;
  id: number;
  last_checked_at: Date | string | null;
  max_attempts: number;
  next_retry_at: Date | string;
  order_id: number;
  order_status: OrderStatus;
  order_uuid: string;
  status: 'pending' | 'verifying' | 'matched' | 'failed' | 'expired';
  tracking_key: string;
}

export interface GetOrdersOptions {
  limit?: number;
  page?: number;
  search?: string;
  status?: string;
}

export interface OrdersListResult {
  orders: AdminOrder[];
  page: number;
  total: number;
  totalPages: number;
}

export async function getAdminOrders(options: GetOrdersOptions = {}): Promise<OrdersListResult> {
  const page = Math.max(1, Number(options.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(options.limit) || 25));
  const offset = (page - 1) * limit;

  const whereConditions: string[] = [];
  const params: unknown[] = [];

  if (options.status && options.status !== 'all') {
    whereConditions.push('o.status = ?');
    params.push(options.status);
  }

  if (options.search && options.search.trim()) {
    const term = `%${options.search.trim()}%`;
    whereConditions.push(
      '(o.concept_reference LIKE ? OR o.customer_name LIKE ? OR o.customer_phone LIKE ? OR o.tracking_key LIKE ?)'
    );
    params.push(term, term, term, term);
  }

  const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

  try {
    const [countRows] = await pool.query<RowDataPacket[]>(
      `SELECT COUNT(*) AS total
       FROM orders o
       INNER JOIN giveaways g ON o.giveaway_id = g.id
       ${whereClause}`,
      params
    );

    const total = Number(countRows[0]?.total || 0);
    const totalPages = Math.ceil(total / limit) || 1;

    const [rows] = await pool.query<OrderRow[]>(
      `SELECT o.id, o.uuid, o.giveaway_id, o.customer_name, o.customer_phone,
              o.ticket_count, o.ticket_numbers,
              CAST(o.total_amount AS DOUBLE) AS total_amount,
              o.currency, o.concept_reference, o.status, o.expires_at,
              o.receipt_url, o.receipt_filename, o.tracking_key, o.bank_reference, o.is_winner,
              o.created_at, o.updated_at,
              g.title AS giveaway_title, g.uuid AS giveaway_uuid, g.slug AS giveaway_slug
       FROM orders o
       INNER JOIN giveaways g ON o.giveaway_id = g.id
       ${whereClause}
       ORDER BY FIELD(o.status, 'in_review', 'pending_payment', 'completed', 'cancelled', 'expired'), o.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    const orders: AdminOrder[] = rows.map((r) => ({
      bank_reference: r.bank_reference,
      concept_reference: r.concept_reference,
      created_at: new Date(r.created_at).toISOString(),
      currency: r.currency,
      customer_name: r.customer_name,
      customer_phone: r.customer_phone,
      expires_at: new Date(r.expires_at).toISOString(),
      giveaway_id: Number(r.giveaway_id),
      giveaway_slug: r.giveaway_slug,
      giveaway_title: r.giveaway_title,
      giveaway_uuid: r.giveaway_uuid,
      id: Number(r.id),
      is_winner: Number(r.is_winner || 0),
      receipt_filename: r.receipt_filename,
      receipt_url: r.receipt_url,
      status: r.status,
      ticket_count: Number(r.ticket_count),
      ticket_numbers: typeof r.ticket_numbers === 'string' ? JSON.parse(r.ticket_numbers) : r.ticket_numbers,
      total_amount: Number(r.total_amount),
      tracking_key: r.tracking_key,
      updated_at: new Date(r.updated_at).toISOString(),
      uuid: r.uuid,
    }));

    return { orders, page, total, totalPages };
  } catch (error) {
    logger.db.error('Error al consultar órdenes en panel de administración', error);
    throw new Error('Error al consultar el listado de órdenes.');
  }
}

export async function approveAdminOrder(
  orderUuid: string,
  adminUser: { email: string; id: number; name: string }
): Promise<{ giveawayTitle: string; success: boolean; ticketCount: number }> {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [orders] = await conn.query<RowDataPacket[]>(
      `SELECT o.id, o.uuid, o.giveaway_id, o.customer_name, o.customer_phone,
              o.ticket_count, o.ticket_numbers, CAST(o.total_amount AS DOUBLE) AS total_amount,
              o.currency, o.status, o.concept_reference, o.tracking_key,
              g.id AS g_id, g.uuid AS giveaway_uuid, g.title AS giveaway_title,
              g.total_tickets, g.min_threshold_pct, g.countdown_hours, g.threshold_reached_at
       FROM orders o
       INNER JOIN giveaways g ON o.giveaway_id = g.id
       WHERE o.uuid = ?
       LIMIT 1
       FOR UPDATE`,
      [orderUuid]
    );

    if (orders.length === 0) {
      await conn.rollback();
      throw new Error('Orden no encontrada.');
    }

    const order = orders[0];

    if (order.status === 'completed') {
      await conn.rollback();
      return { giveawayTitle: order.giveaway_title, success: true, ticketCount: order.ticket_count };
    }

    if (order.status === 'expired') {
      await conn.rollback();
      throw new Error('No se puede aprobar una orden expirada. Los boletos ya fueron liberados.');
    }

    if (order.status === 'cancelled') {
      await conn.rollback();
      throw new Error('No se puede aprobar una orden cancelada.');
    }

    const tickets: number[] =
      typeof order.ticket_numbers === 'string' ? JSON.parse(order.ticket_numbers) : order.ticket_numbers;

    await conn.query(
      `UPDATE orders
       SET status = 'completed', updated_at = NOW()
       WHERE id = ?`,
      [order.id]
    );

    if (tickets.length > 0) {
      await conn.query(
        `UPDATE giveaway_tickets
         SET status = 'paid', reserved_until = NULL
         WHERE order_id = ? AND ticket_number IN (?)`,
        [order.id, tickets]
      );
    }

    await conn.query(
      `UPDATE spei_validation_queue
       SET status = 'matched', last_checked_at = NOW()
       WHERE order_id = ?`,
      [order.id]
    );

    const auditUuid = crypto.randomUUID();
    await conn.query(
      `INSERT INTO user_audit_logs (
        uuid, order_id, order_uuid, customer_phone, customer_name,
        action, actor_type, ip_address, user_agent,
        previous_status, new_status, amount, currency, details
      ) VALUES (?, ?, ?, ?, ?, 'ORDER_APPROVED_MANUALLY', 'admin', '127.0.0.1', 'ProjectBoreal/Admin', ?, 'completed', ?, ?, ?)`,
      [
        auditUuid,
        order.id,
        order.uuid,
        order.customer_phone,
        order.customer_name,
        order.status,
        order.total_amount,
        order.currency,
        JSON.stringify({
          admin_email: adminUser.email,
          admin_id: adminUser.id,
          admin_name: adminUser.name,
          ticket_count: order.ticket_count,
          ticket_numbers: tickets,
        }),
      ]
    );

    await conn.commit();

    await logAdminAudit({
      action: 'ORDER_APPROVED_MANUALLY',
      adminUser,
      amount: order.total_amount,
      currency: order.currency,
      customerName: order.customer_name,
      customerPhone: order.customer_phone,
      details: {
        admin_email: adminUser.email,
        admin_id: adminUser.id,
        admin_name: adminUser.name,
        ticket_count: order.ticket_count,
        ticket_numbers: tickets,
      },
      newStatus: 'completed',
      orderId: order.id,
      orderUuid: order.uuid,
      previousStatus: order.status,
    });

    await deleteCache(`giveaway:${order.giveaway_uuid}:tickets`);
    await deleteCache(`giveaway:${order.giveaway_uuid}`);
    await deleteCache('giveaways:active');
    await deleteCachePattern('giveaway:*');

    await publishGiveawayEvent('boreal:giveaways', {
      giveaway_id: order.giveaway_id,
      giveaway_uuid: order.giveaway_uuid,
      ticket_count: order.ticket_count,
      ticket_numbers: tickets,
      type: 'TICKETS_PAID',
    });

    if (Number(order.min_threshold_pct || 0) > 0 && !order.threshold_reached_at) {
      try {
        const [paidRows] = await pool.query<RowDataPacket[]>(
          `SELECT COUNT(*) AS paid_count FROM giveaway_tickets WHERE giveaway_id = ? AND status = 'paid'`,
          [order.giveaway_id]
        );
        const paidCount = Number(paidRows[0]?.paid_count || 0);
        const totalTickets = Number(order.total_tickets || 100);
        const pctSold = (paidCount / totalTickets) * 100;

        if (pctSold >= Number(order.min_threshold_pct)) {
          const countdownHours = Number(order.countdown_hours || 48);
          const computedEndDate = new Date(Date.now() + countdownHours * 3600 * 1000);

          await pool.query(
            `UPDATE giveaways
             SET threshold_reached_at = NOW(), end_date = ?
             WHERE id = ? AND threshold_reached_at IS NULL`,
            [computedEndDate, order.giveaway_id]
          );

          await deleteCache(`giveaway:${order.giveaway_uuid}`);
          await deleteCache('giveaways:active');

          await publishGiveawayEvent('boreal:giveaways', {
            countdown_hours: countdownHours,
            end_date: computedEndDate.toISOString(),
            giveaway_uuid: order.giveaway_uuid,
            threshold_reached_at: new Date().toISOString(),
            type: 'GIVEAWAY_THRESHOLD_REACHED',
          });

          logger.app.info(
            `Umbral de sorteo ${order.giveaway_uuid} alcanzado tras aprobación manual (${pctSold.toFixed(1)}%). Cronómetro iniciado.`
          );
        }
      } catch (err) {
        logger.app.warn('Error al evaluar umbral tras aprobación de orden', err);
      }
    }

    return {
      giveawayTitle: order.giveaway_title,
      success: true,
      ticketCount: order.ticket_count,
    };
  } catch (error) {
    await conn.rollback();
    logger.db.error('Error al aprobar orden manualmente en panel de administración', error);
    throw error;
  } finally {
    conn.release();
  }
}

export async function cancelAdminOrder(
  orderUuid: string,
  adminUser: { email: string; id: number; name: string },
  reason?: string
): Promise<{ giveawayTitle: string; success: boolean; ticketCount: number }> {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [orders] = await conn.query<RowDataPacket[]>(
      `SELECT o.id, o.uuid, o.giveaway_id, o.customer_name, o.customer_phone,
              o.ticket_count, o.ticket_numbers, CAST(o.total_amount AS DOUBLE) AS total_amount,
              o.currency, o.status,
              g.id AS g_id, g.uuid AS giveaway_uuid, g.title AS giveaway_title, g.total_tickets
       FROM orders o
       INNER JOIN giveaways g ON o.giveaway_id = g.id
       WHERE o.uuid = ?
       LIMIT 1
       FOR UPDATE`,
      [orderUuid]
    );

    if (orders.length === 0) {
      await conn.rollback();
      throw new Error('Orden no encontrada.');
    }

    const order = orders[0];

    if (order.status === 'cancelled') {
      await conn.rollback();
      return { giveawayTitle: order.giveaway_title, success: true, ticketCount: order.ticket_count };
    }

    if (order.status === 'completed') {
      await conn.rollback();
      throw new Error('No se puede cancelar directamente una orden que ya fue completada.');
    }

    const tickets: number[] =
      typeof order.ticket_numbers === 'string' ? JSON.parse(order.ticket_numbers) : order.ticket_numbers;

    await conn.query(
      `UPDATE orders
       SET status = 'cancelled', updated_at = NOW()
       WHERE id = ?`,
      [order.id]
    );

    await conn.query(
      `UPDATE giveaway_tickets
       SET status = 'available', order_id = NULL, reserved_until = NULL
       WHERE order_id = ? AND status = 'reserved'`,
      [order.id]
    );

    const shouldRestoreTickets = order.status === 'pending_payment' || order.status === 'in_review';
    if (shouldRestoreTickets) {
      await conn.query(
        `UPDATE giveaways
         SET available_tickets = LEAST(total_tickets, available_tickets + ?)
         WHERE id = ?`,
        [order.ticket_count, order.giveaway_id]
      );
    }

    await conn.query(
      `UPDATE spei_validation_queue
       SET status = 'failed'
       WHERE order_id = ?`,
      [order.id]
    );

    const auditUuid = crypto.randomUUID();
    await conn.query(
      `INSERT INTO user_audit_logs (
        uuid, order_id, order_uuid, customer_phone, customer_name,
        action, actor_type, ip_address, user_agent,
        previous_status, new_status, amount, currency, details
      ) VALUES (?, ?, ?, ?, ?, 'ORDER_CANCELLED_MANUALLY', 'admin', '127.0.0.1', 'ProjectBoreal/Admin', ?, 'cancelled', ?, ?, ?)`,
      [
        auditUuid,
        order.id,
        order.uuid,
        order.customer_phone,
        order.customer_name,
        order.status,
        order.total_amount,
        order.currency,
        JSON.stringify({
          admin_email: adminUser.email,
          admin_id: adminUser.id,
          admin_name: adminUser.name,
          reason: reason || 'Cancelado por el administrador',
          ticket_count: order.ticket_count,
          ticket_numbers: tickets,
        }),
      ]
    );
    await conn.commit();

    await logAdminAudit({
      action: 'ORDER_CANCELLED_MANUALLY',
      adminUser,
      amount: order.total_amount,
      currency: order.currency,
      customerName: order.customer_name,
      customerPhone: order.customer_phone,
      details: {
        admin_email: adminUser.email,
        admin_id: adminUser.id,
        admin_name: adminUser.name,
        reason: reason || 'Cancelado por el administrador',
        ticket_count: order.ticket_count,
        ticket_numbers: tickets,
      },
      newStatus: 'cancelled',
      orderId: order.id,
      orderUuid: order.uuid,
      previousStatus: order.status,
    });

    await deleteCache(`giveaway:${order.giveaway_uuid}:tickets`);
    await deleteCache(`giveaway:${order.giveaway_uuid}`);
    await deleteCache('giveaways:active');
    await deleteCachePattern('giveaway:*');

    await publishGiveawayEvent('boreal:giveaways', {
      giveaway_id: order.giveaway_id,
      giveaway_uuid: order.giveaway_uuid,
      ticket_count: order.ticket_count,
      ticket_numbers: tickets,
      type: 'TICKETS_RELEASED',
    });

    return {
      giveawayTitle: order.giveaway_title,
      success: true,
      ticketCount: order.ticket_count,
    };
  } catch (error) {
    await conn.rollback();
    logger.db.error('Error al cancelar orden manualmente en panel de administración', error);
    throw error;
  } finally {
    conn.release();
  }
}

export async function getAdminSpeiQueue(limit = 50): Promise<SpeiQueueItem[]> {
  try {
    const [rows] = await pool.query<SpeiRow[]>(
      `SELECT q.id, q.order_id, q.tracking_key,
              CAST(q.expected_amount AS DOUBLE) AS expected_amount,
              q.attempts, q.max_attempts, q.next_retry_at, q.last_checked_at,
              q.banxico_response, q.status, q.created_at,
              o.uuid AS order_uuid, o.customer_name, o.customer_phone, o.status AS order_status,
              g.title AS giveaway_title
       FROM spei_validation_queue q
       INNER JOIN orders o ON q.order_id = o.id
       INNER JOIN giveaways g ON o.giveaway_id = g.id
       ORDER BY FIELD(q.status, 'verifying', 'pending', 'failed', 'matched', 'expired'), q.created_at DESC
       LIMIT ?`,
      [limit]
    );

    return rows.map((r) => ({
      attempts: Number(r.attempts),
      banxico_response:
        typeof r.banxico_response === 'string' ? JSON.parse(r.banxico_response) : r.banxico_response,
      created_at: new Date(r.created_at).toISOString(),
      customer_name: r.customer_name,
      customer_phone: r.customer_phone,
      expected_amount: Number(r.expected_amount),
      giveaway_title: r.giveaway_title,
      id: Number(r.id),
      last_checked_at: r.last_checked_at ? new Date(r.last_checked_at).toISOString() : null,
      max_attempts: Number(r.max_attempts),
      next_retry_at: new Date(r.next_retry_at).toISOString(),
      order_id: Number(r.order_id),
      order_status: r.order_status,
      order_uuid: r.order_uuid,
      status: r.status,
      tracking_key: r.tracking_key,
    }));
  } catch (error) {
    logger.db.error('Error al consultar cola de validación SPEI en panel de administración', error);
    throw new Error('Error al consultar la cola de validación SPEI.');
  }
}

export async function triggerSpeiValidationBatch(): Promise<{ processed: number }> {
  try {
    const [queueRows] = await pool.query<RowDataPacket[]>(
      `SELECT q.id, q.order_id, q.tracking_key, CAST(q.expected_amount AS DOUBLE) AS expected_amount,
              o.uuid AS order_uuid, o.status AS order_status
       FROM spei_validation_queue q
       INNER JOIN orders o ON q.order_id = o.id
       WHERE q.status IN ('pending', 'verifying')
       LIMIT 20`
    );

    if (queueRows.length === 0) {
      return { processed: 0 };
    }

    let processed = 0;

    for (const item of queueRows) {
      const isSandbox = config.nodeEnv !== 'production' && process.env.BANXICO_SANDBOX === 'true';
      const cleanKey = String(item.tracking_key || '').trim().toUpperCase();
      const amount = Number(item.expected_amount || 0);

      if (isSandbox && cleanKey.length >= 8 && amount > 0) {
        await approveAdminOrder(item.order_uuid, {
          email: 'spei-system@projectboreal.internal',
          id: 0,
          name: 'Banxico SPEI Monitor',
        });
        processed++;
      } else {
        await pool.query(
          `UPDATE spei_validation_queue
           SET attempts = attempts + 1, last_checked_at = NOW(),
               status = IF(attempts + 1 >= max_attempts, 'failed', 'verifying')
           WHERE id = ?`,
          [item.id]
        );
      }
    }

    return { processed };
  } catch (error) {
    logger.db.error('Error al ejecutar validación de cola SPEI por lote', error);
    throw new Error('Error al procesar la cola de validación SPEI.');
  }
}

export async function getAdminOrderReceiptFilename(uuid: string): Promise<string | null> {
  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      'SELECT receipt_filename FROM orders WHERE uuid = ? LIMIT 1',
      [uuid]
    );
    if (!rows.length || !rows[0].receipt_filename) return null;
    return rows[0].receipt_filename as string;
  } catch (error) {
    logger.db.error('Error al consultar archivo de comprobante de orden en Admin', error);
    throw new Error('Error al consultar comprobante');
  }
}
