import { pool } from '../config/database.config.js';
import { redis } from '../config/redis.config.js';
import { logger } from './logger.service.js';
import { ResultSetHeader, RowDataPacket } from 'mysql2/promise';

export interface AdminOrderSummary {
  bank_reference: string | null;
  concept_reference: string;
  created_at: string;
  currency: string;
  customer_name: string;
  customer_phone: string;
  customer_state: string | null;
  expires_at: string;
  giveaway_id: number;
  giveaway_title: string;
  giveaway_uuid: string;
  id: number;
  is_winner: number;
  receipt_filename: string | null;
  receipt_url: string | null;
  spei_attempts: number;
  spei_last_checked_at: string | null;
  spei_status: 'pending' | 'verifying' | 'matched' | 'failed' | 'expired' | 'manual_review' | null;
  status: 'pending_payment' | 'in_review' | 'completed' | 'expired' | 'cancelled';
  ticket_count: number;
  ticket_numbers: number[];
  total_amount: number;
  tracking_key: string | null;
  updated_at: string;
  uuid: string;
}

export interface AdminOrderDetail extends AdminOrderSummary {
  banxico_response: any;
  giveaway_price: number;
  giveaway_status: string;
  giveaway_total_tickets: number;
  raw_receipt_url?: string;
}

export interface OrdersFilterParams {
  giveawayUuid?: string;
  limit?: number;
  page?: number;
  search?: string;
  status?: string;
}

export interface OrdersListResult {
  orders: AdminOrderSummary[];
  pagination: {
    currentPage: number;
    limit: number;
    totalCount: number;
    totalPages: number;
  };
}

export interface PaymentKpis {
  cancelledCount: number;
  completedAmount: number;
  completedCount: number;
  expiredCount: number;
  inReviewAmount: number;
  inReviewCount: number;
  manualReviewCount: number;
  pendingPaymentAmount: number;
  pendingPaymentCount: number;
  totalOrdersCount: number;
}

export class OrdersService {
  async getOrdersList(params: OrdersFilterParams): Promise<OrdersListResult> {
    const page = Math.max(1, Number(params.page) || 1);
    const limit = Math.min(100, Math.max(5, Number(params.limit) || 20));
    const offset = (page - 1) * limit;

    const whereConditions: string[] = [];
    const queryParams: unknown[] = [];

    if (params.status && params.status !== 'all') {
      if (params.status === 'manual_review') {
        whereConditions.push("(o.status = 'in_review' AND q.status = 'manual_review')");
      } else {
        whereConditions.push('o.status = ?');
        queryParams.push(params.status);
      }
    }

    if (params.giveawayUuid && params.giveawayUuid !== 'all') {
      whereConditions.push('g.uuid = ?');
      queryParams.push(params.giveawayUuid);
    }

    if (params.search && params.search.trim().length > 0) {
      const q = `%${params.search.trim().toLowerCase()}%`;
      whereConditions.push(
        '(LOWER(o.customer_name) LIKE ? OR o.customer_phone LIKE ? OR LOWER(o.uuid) LIKE ? OR LOWER(COALESCE(o.tracking_key, "")) LIKE ? OR LOWER(COALESCE(o.bank_reference, "")) LIKE ? OR LOWER(COALESCE(o.concept_reference, "")) LIKE ?)'
      );
      queryParams.push(q, q, q, q, q, q);
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    const countQuery = `
      SELECT COUNT(*) AS total
      FROM orders o
      INNER JOIN giveaways g ON o.giveaway_id = g.id
      LEFT JOIN spei_validation_queue q ON q.order_id = o.id
      ${whereClause}
    `;

    const [countRows] = await pool.query<RowDataPacket[]>(countQuery, queryParams);
    const totalCount = Number(countRows[0]?.total || 0);
    const totalPages = Math.ceil(totalCount / limit) || 1;

    const selectQuery = `
      SELECT o.id, o.uuid, o.giveaway_id, o.customer_name, o.customer_phone, o.customer_state,
             o.ticket_count, o.ticket_numbers, CAST(o.total_amount AS DOUBLE) AS total_amount,
             o.currency, o.concept_reference, o.status, o.expires_at, o.receipt_url, o.receipt_filename,
             o.tracking_key, o.bank_reference, o.is_winner, o.created_at, o.updated_at,
             g.title AS giveaway_title, g.uuid AS giveaway_uuid,
             q.status AS spei_status, q.attempts AS spei_attempts, q.last_checked_at AS spei_last_checked_at
      FROM orders o
      INNER JOIN giveaways g ON o.giveaway_id = g.id
      LEFT JOIN spei_validation_queue q ON q.order_id = o.id
      ${whereClause}
      ORDER BY
        CASE
          WHEN o.status = 'in_review' THEN 1
          WHEN o.status = 'pending_payment' THEN 2
          WHEN o.status = 'completed' THEN 3
          ELSE 4
        END ASC,
        o.created_at DESC
      LIMIT ? OFFSET ?
    `;

    const [rows] = await pool.query<RowDataPacket[]>(selectQuery, [...queryParams, limit, offset]);

    const orders: AdminOrderSummary[] = rows.map((r) => {
      let tickets: number[] = [];
      if (typeof r.ticket_numbers === 'string') {
        try {
          tickets = JSON.parse(r.ticket_numbers);
        } catch {
          tickets = [];
        }
      } else if (Array.isArray(r.ticket_numbers)) {
        tickets = r.ticket_numbers;
      }

      return {
        bank_reference: r.bank_reference || null,
        concept_reference: r.concept_reference,
        created_at: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
        currency: r.currency || 'MXN',
        customer_name: r.customer_name,
        customer_phone: r.customer_phone,
        customer_state: r.customer_state || null,
        expires_at: r.expires_at instanceof Date ? r.expires_at.toISOString() : String(r.expires_at),
        giveaway_id: Number(r.giveaway_id),
        giveaway_title: r.giveaway_title,
        giveaway_uuid: r.giveaway_uuid,
        id: Number(r.id),
        is_winner: Number(r.is_winner || 0),
        receipt_filename: r.receipt_filename || null,
        receipt_url: r.receipt_filename ? `/api/orders/${r.uuid}/receipt` : null,
        spei_attempts: Number(r.spei_attempts || 0),
        spei_last_checked_at: r.spei_last_checked_at ? (r.spei_last_checked_at instanceof Date ? r.spei_last_checked_at.toISOString() : String(r.spei_last_checked_at)) : null,
        spei_status: r.spei_status || null,
        status: r.status,
        ticket_count: Number(r.ticket_count || 1),
        ticket_numbers: tickets,
        total_amount: Number(r.total_amount || 0),
        tracking_key: r.tracking_key || null,
        updated_at: r.updated_at instanceof Date ? r.updated_at.toISOString() : String(r.updated_at),
        uuid: r.uuid,
      };
    });

    return {
      orders,
      pagination: {
        currentPage: page,
        limit,
        totalCount,
        totalPages,
      },
    };
  }

  async getPaymentKpis(): Promise<PaymentKpis> {
    const [rows] = await pool.query<RowDataPacket[]>(`
      SELECT
        COUNT(CASE WHEN o.status = 'in_review' THEN 1 END) AS inReviewCount,
        COALESCE(SUM(CASE WHEN o.status = 'in_review' THEN o.total_amount ELSE 0 END), 0) AS inReviewAmount,
        COUNT(CASE WHEN o.status = 'pending_payment' AND o.expires_at > NOW() THEN 1 END) AS pendingPaymentCount,
        COALESCE(SUM(CASE WHEN o.status = 'pending_payment' AND o.expires_at > NOW() THEN o.total_amount ELSE 0 END), 0) AS pendingPaymentAmount,
        COUNT(CASE WHEN o.status = 'completed' THEN 1 END) AS completedCount,
        COALESCE(SUM(CASE WHEN o.status = 'completed' THEN o.total_amount ELSE 0 END), 0) AS completedAmount,
        COUNT(CASE WHEN o.status = 'cancelled' THEN 1 END) AS cancelledCount,
        COUNT(CASE WHEN o.status = 'expired' THEN 1 END) AS expiredCount,
        COUNT(CASE WHEN q.status = 'manual_review' AND o.status = 'in_review' THEN 1 END) AS manualReviewCount,
        COUNT(*) AS totalOrdersCount
      FROM orders o
      LEFT JOIN spei_validation_queue q ON q.order_id = o.id
    `);

    const r = rows[0] || {};
    return {
      cancelledCount: Number(r.cancelledCount || 0),
      completedAmount: Number(r.completedAmount || 0),
      completedCount: Number(r.completedCount || 0),
      expiredCount: Number(r.expiredCount || 0),
      inReviewAmount: Number(r.inReviewAmount || 0),
      inReviewCount: Number(r.inReviewCount || 0),
      manualReviewCount: Number(r.manualReviewCount || 0),
      pendingPaymentAmount: Number(r.pendingPaymentAmount || 0),
      pendingPaymentCount: Number(r.pendingPaymentCount || 0),
      totalOrdersCount: Number(r.totalOrdersCount || 0),
    };
  }

  async getOrderDetail(orderUuid: string): Promise<AdminOrderDetail | null> {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT o.id, o.uuid, o.giveaway_id, o.customer_name, o.customer_phone, o.customer_state,
              o.ticket_count, o.ticket_numbers, CAST(o.total_amount AS DOUBLE) AS total_amount,
              o.currency, o.concept_reference, o.status, o.expires_at, o.receipt_url, o.receipt_filename,
              o.tracking_key, o.bank_reference, o.is_winner, o.created_at, o.updated_at,
              g.title AS giveaway_title, g.uuid AS giveaway_uuid, g.status AS giveaway_status,
              CAST(g.ticket_price AS DOUBLE) AS giveaway_price, g.total_tickets AS giveaway_total_tickets,
              q.status AS spei_status, q.attempts AS spei_attempts, q.last_checked_at AS spei_last_checked_at,
              q.banxico_response
       FROM orders o
       INNER JOIN giveaways g ON o.giveaway_id = g.id
       LEFT JOIN spei_validation_queue q ON q.order_id = o.id
       WHERE o.uuid = ?
       LIMIT 1`,
      [orderUuid]
    );

    if (rows.length === 0) return null;
    const r = rows[0];

    let tickets: number[] = [];
    if (typeof r.ticket_numbers === 'string') {
      try {
        tickets = JSON.parse(r.ticket_numbers);
      } catch {
        tickets = [];
      }
    } else if (Array.isArray(r.ticket_numbers)) {
      tickets = r.ticket_numbers;
    }

    let parsedBanxico: any = null;
    if (r.banxico_response) {
      if (typeof r.banxico_response === 'string') {
        try {
          parsedBanxico = JSON.parse(r.banxico_response);
        } catch {
          parsedBanxico = { raw: r.banxico_response };
        }
      } else {
        parsedBanxico = r.banxico_response;
      }
    }

    return {
      bank_reference: r.bank_reference || null,
      banxico_response: parsedBanxico,
      concept_reference: r.concept_reference,
      created_at: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
      currency: r.currency || 'MXN',
      customer_name: r.customer_name,
      customer_phone: r.customer_phone,
      customer_state: r.customer_state || null,
      expires_at: r.expires_at instanceof Date ? r.expires_at.toISOString() : String(r.expires_at),
      giveaway_id: Number(r.giveaway_id),
      giveaway_price: Number(r.giveaway_price || 0),
      giveaway_status: r.giveaway_status,
      giveaway_title: r.giveaway_title,
      giveaway_total_tickets: Number(r.giveaway_total_tickets || 100),
      giveaway_uuid: r.giveaway_uuid,
      id: Number(r.id),
      is_winner: Number(r.is_winner || 0),
      receipt_filename: r.receipt_filename || null,
      receipt_url: r.receipt_filename ? `/api/orders/${r.uuid}/receipt` : null,
      spei_attempts: Number(r.spei_attempts || 0),
      spei_last_checked_at: r.spei_last_checked_at ? (r.spei_last_checked_at instanceof Date ? r.spei_last_checked_at.toISOString() : String(r.spei_last_checked_at)) : null,
      spei_status: r.spei_status || null,
      status: r.status,
      ticket_count: Number(r.ticket_count || 1),
      ticket_numbers: tickets,
      total_amount: Number(r.total_amount || 0),
      tracking_key: r.tracking_key || null,
      updated_at: r.updated_at instanceof Date ? r.updated_at.toISOString() : String(r.updated_at),
      uuid: r.uuid,
    };
  }

  async approveOrderManual(orderUuid: string, adminNotes?: string): Promise<{ order?: AdminOrderDetail; success: boolean }> {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      const [orderRows] = await conn.query<RowDataPacket[]>(
        `SELECT o.id, o.uuid, o.giveaway_id, o.status, o.ticket_count, o.ticket_numbers, o.total_amount,
                g.uuid AS giveaway_uuid, g.status AS giveaway_status, g.min_threshold_pct, g.countdown_hours, g.threshold_reached_at, g.total_tickets
         FROM orders o
         INNER JOIN giveaways g ON o.giveaway_id = g.id
         WHERE o.uuid = ?
         LIMIT 1
         FOR UPDATE`,
        [orderUuid]
      );

      if (orderRows.length === 0) {
        await conn.rollback();
        return { success: false };
      }

      const order = orderRows[0];
      if (order.status === 'completed') {
        await conn.rollback();
        const detail = await this.getOrderDetail(orderUuid);
        return { order: detail || undefined, success: true };
      }

      if (order.giveaway_status !== 'active') {
        await conn.rollback();
        throw new Error('GIVEAWAY_NOT_ACTIVE');
      }

      let tickets: number[] = [];
      if (typeof order.ticket_numbers === 'string') {
        try {
          tickets = JSON.parse(order.ticket_numbers);
        } catch {
          tickets = [];
        }
      } else if (Array.isArray(order.ticket_numbers)) {
        tickets = order.ticket_numbers;
      }

      await conn.query(
        `UPDATE orders
         SET status = 'completed', updated_at = NOW()
         WHERE id = ?`,
        [order.id]
      );

      if (tickets.length > 0) {
        await conn.query(
          `UPDATE giveaway_tickets
           SET status = 'paid', reserved_until = NULL, updated_at = NOW()
           WHERE order_id = ? AND ticket_number IN (?)`,
          [order.id, tickets]
        );
      }

      const banxicoPayload = JSON.stringify({
        approved_by: 'admin_manual',
        approved_date: new Date().toISOString(),
        notes: adminNotes || 'Aprobado manualmente por el administrador tras revisión documental.',
      });

      await conn.query(
        `INSERT INTO spei_validation_queue (order_id, tracking_key, expected_amount, attempts, max_attempts, next_retry_at, last_checked_at, status, banxico_response)
         VALUES (?, COALESCE(?, 'MANUAL_APPROVAL'), ?, 1, 6, NOW(), NOW(), 'matched', ?)
         ON DUPLICATE KEY UPDATE status = 'matched', last_checked_at = NOW(), banxico_response = VALUES(banxico_response)`,
        [order.id, order.tracking_key, order.total_amount, banxicoPayload]
      );

      let thresholdEventPayload: any = null;
      if (order.min_threshold_pct > 0 && !order.threshold_reached_at) {
        const [paidRows] = await conn.query<RowDataPacket[]>(
          'SELECT COUNT(*) AS paid_count FROM giveaway_tickets WHERE giveaway_id = ? AND status = "paid"',
          [order.giveaway_id]
        );
        const paidCnt = Number(paidRows[0]?.paid_count || 0);
        const totalTkts = Number(order.total_tickets || 100);
        const pctSold = (paidCnt / totalTkts) * 100;

        if (pctSold >= order.min_threshold_pct) {
          const cdHours = Number(order.countdown_hours || 72);
          await conn.query(
            'UPDATE giveaways SET threshold_reached_at = NOW(), end_date = DATE_ADD(NOW(), INTERVAL ? HOUR) WHERE id = ? AND threshold_reached_at IS NULL',
            [cdHours, order.giveaway_id]
          );
          thresholdEventPayload = {
            countdown_hours: cdHours,
            giveaway_uuid: order.giveaway_uuid,
            type: 'GIVEAWAY_THRESHOLD_REACHED',
          };
        }
      }

      await conn.commit();

      try {
        const gUuid = order.giveaway_uuid;
        await redis.del(
          'boreal:cache:giveaways:active',
          'boreal:cache:giveaways:winners',
          'giveaways:active',
          'giveaways:winners',
          `boreal:cache:giveaway:${gUuid}`,
          `boreal:cache:giveaway:${gUuid}:tickets`,
          `giveaway:${gUuid}`,
          `giveaway:${gUuid}:tickets`
        );

        await redis.publish(
          'boreal:giveaways',
          JSON.stringify({
            giveaway_id: order.giveaway_id,
            giveaway_uuid: order.giveaway_uuid,
            ticket_count: order.ticket_count,
            ticket_numbers: tickets,
            type: 'TICKETS_PAID',
          })
        );

        if (thresholdEventPayload) {
          await redis.publish('boreal:giveaways', JSON.stringify(thresholdEventPayload));
        }

        await redis.publish(
          'boreal:orders',
          JSON.stringify({
            order_id: order.id,
            order_uuid: order.uuid,
            ticket_count: order.ticket_count,
            ticket_numbers: tickets,
            type: 'ORDER_APPROVED',
          })
        );
      } catch (redisErr) {
        logger.app.warn('Advertencia al notificar eventos Redis tras aprobación manual:', redisErr);
      }

      logger.app.info(`Orden ${orderUuid} aprobada y liquidada manualmente por el administrador.`);
      const updatedDetail = await this.getOrderDetail(orderUuid);
      return { order: updatedDetail || undefined, success: true };
    } catch (error) {
      await conn.rollback();
      logger.db.error(`Error al aprobar manualmente orden ${orderUuid}`, error);
      throw error;
    } finally {
      conn.release();
    }
  }

  async rejectOrderManual(orderUuid: string, rejectionReason: string): Promise<{ order?: AdminOrderDetail; success: boolean }> {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      const [orderRows] = await conn.query<RowDataPacket[]>(
        `SELECT o.id, o.uuid, o.giveaway_id, o.status, o.ticket_count, o.ticket_numbers, o.total_amount,
                g.uuid AS giveaway_uuid
         FROM orders o
         INNER JOIN giveaways g ON o.giveaway_id = g.id
         WHERE o.uuid = ?
         LIMIT 1
         FOR UPDATE`,
        [orderUuid]
      );

      if (orderRows.length === 0) {
        await conn.rollback();
        return { success: false };
      }

      const order = orderRows[0];
      if (order.status === 'cancelled') {
        await conn.rollback();
        const detail = await this.getOrderDetail(orderUuid);
        return { order: detail || undefined, success: true };
      }

      let tickets: number[] = [];
      if (typeof order.ticket_numbers === 'string') {
        try {
          tickets = JSON.parse(order.ticket_numbers);
        } catch {
          tickets = [];
        }
      } else if (Array.isArray(order.ticket_numbers)) {
        tickets = order.ticket_numbers;
      }

      await conn.query(
        `UPDATE orders
         SET status = 'cancelled', updated_at = NOW()
         WHERE id = ?`,
        [order.id]
      );

      if (tickets.length > 0) {
        await conn.query(
          `UPDATE giveaway_tickets
           SET status = 'available', order_id = NULL, reserved_until = NULL, updated_at = NOW()
           WHERE order_id = ? AND status = 'reserved'`,
          [order.id]
        );
      }

      await conn.query(
        `UPDATE giveaways
         SET available_tickets = LEAST(total_tickets, available_tickets + ?)
         WHERE id = ?`,
        [order.ticket_count, order.giveaway_id]
      );

      const banxicoPayload = JSON.stringify({
        reason: rejectionReason || 'Comprobante rechazado por el administrador.',
        rejected_by: 'admin_manual',
        rejected_date: new Date().toISOString(),
      });

      await conn.query(
        `INSERT INTO spei_validation_queue (order_id, tracking_key, expected_amount, attempts, max_attempts, next_retry_at, last_checked_at, status, banxico_response)
         VALUES (?, COALESCE(?, 'REJECTED'), ?, 6, 6, NOW(), NOW(), 'failed', ?)
         ON DUPLICATE KEY UPDATE status = 'failed', last_checked_at = NOW(), banxico_response = VALUES(banxico_response)`,
        [order.id, order.tracking_key, order.total_amount, banxicoPayload]
      );

      await conn.commit();

      try {
        const gUuid = order.giveaway_uuid;
        await redis.del(
          'boreal:cache:giveaways:active',
          'boreal:cache:giveaways:winners',
          'giveaways:active',
          'giveaways:winners',
          `boreal:cache:giveaway:${gUuid}`,
          `boreal:cache:giveaway:${gUuid}:tickets`,
          `giveaway:${gUuid}`,
          `giveaway:${gUuid}:tickets`
        );

        await redis.publish(
          'boreal:giveaways',
          JSON.stringify({
            giveaway_id: order.giveaway_id,
            giveaway_uuid: order.giveaway_uuid,
            released_count: order.ticket_count,
            ticket_count: order.ticket_count,
            ticket_numbers: tickets,
            type: 'TICKETS_RELEASED',
          })
        );

        await redis.publish(
          'boreal:orders',
          JSON.stringify({
            errors: [rejectionReason || 'Comprobante rechazado.'],
            order_id: order.id,
            order_uuid: order.uuid,
            type: 'ORDER_REJECTED',
          })
        );
      } catch (redisErr) {
        logger.app.warn('Advertencia al notificar eventos Redis tras rechazo manual:', redisErr);
      }

      logger.app.info(`Orden ${orderUuid} rechazada manualmente. Motivo: ${rejectionReason}`);
      const updatedDetail = await this.getOrderDetail(orderUuid);
      return { order: updatedDetail || undefined, success: true };
    } catch (error) {
      await conn.rollback();
      logger.db.error(`Error al rechazar orden ${orderUuid}`, error);
      throw error;
    } finally {
      conn.release();
    }
  }

  async updateTrackingKey(orderUuid: string, trackingKey: string): Promise<AdminOrderDetail | null> {
    const cleanKey = trackingKey.trim().toUpperCase();
    if (!cleanKey) return null;

    const [orderRows] = await pool.query<RowDataPacket[]>(
      'SELECT id FROM orders WHERE uuid = ? LIMIT 1',
      [orderUuid]
    );
    if (orderRows.length === 0) return null;
    const orderId = orderRows[0].id;

    await pool.query(
      'UPDATE orders SET tracking_key = ?, updated_at = NOW() WHERE id = ?',
      [cleanKey, orderId]
    );

    await pool.query(
      `INSERT INTO spei_validation_queue (order_id, tracking_key, expected_amount, attempts, max_attempts, next_retry_at, status)
       SELECT id, ?, total_amount, 0, 6, NOW(), 'pending' FROM orders WHERE id = ?
       ON DUPLICATE KEY UPDATE tracking_key = VALUES(tracking_key), attempts = 0, status = 'pending', next_retry_at = NOW()`,
      [cleanKey, orderId]
    );

    return await this.getOrderDetail(orderUuid);
  }
}

export const ordersService = new OrdersService();