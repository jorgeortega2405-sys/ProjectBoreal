import { pool } from '../config/database.config.js';
import { logger } from './logger.service.js';
import { RowDataPacket } from 'mysql2/promise';

export interface CustomerSummary {
  block_reason: string | null;
  blocked_at: string | null;
  cancelled_orders_count: number;
  completed_orders_count: number;
  customer_name: string;
  customer_phone: string;
  customer_state: string | null;
  first_order_at: string;
  is_blocked: boolean;
  last_order_at: string;
  pending_orders_count: number;
  total_orders_count: number;
  total_spent: number;
  total_tickets: number;
}

export interface CustomerOrderSummary {
  concept_reference: string;
  created_at: string;
  currency: string;
  giveaway_id: number;
  giveaway_title: string;
  giveaway_uuid: string;
  id: number;
  is_winner: number;
  receipt_filename: string | null;
  status: 'pending_payment' | 'in_review' | 'completed' | 'expired' | 'cancelled';
  ticket_count: number;
  ticket_numbers: number[];
  total_amount: number;
  tracking_key: string | null;
  uuid: string;
}

export interface CustomerDetail {
  customer: CustomerSummary;
  orders: CustomerOrderSummary[];
}

export interface CustomersKpis {
  activeBuyersCount: number;
  blockedCustomersCount: number;
  totalCustomers: number;
  totalTicketsSold: number;
}

export async function getCustomersKpis(): Promise<CustomersKpis> {
  try {
    const [customerStats] = await pool.query<RowDataPacket[]>(
      `SELECT
        COUNT(DISTINCT customer_phone) as total_customers,
        COUNT(DISTINCT CASE WHEN status = 'completed' THEN customer_phone END) as active_buyers,
        COALESCE(SUM(CASE WHEN status = 'completed' THEN ticket_count ELSE 0 END), 0) as total_tickets
       FROM orders`
    );

    const [blockedStats] = await pool.query<RowDataPacket[]>(
      `SELECT COUNT(*) as blocked_count FROM blocked_customers`
    );

    const s = customerStats[0] || {};
    const b = blockedStats[0] || {};

    return {
      activeBuyersCount: Number(s.active_buyers || 0),
      blockedCustomersCount: Number(b.blocked_count || 0),
      totalCustomers: Number(s.total_customers || 0),
      totalTicketsSold: Number(s.total_tickets || 0),
    };
  } catch (error) {
    logger.db.error('Error al obtener KPIs de clientes:', error);
    return {
      activeBuyersCount: 0,
      blockedCustomersCount: 0,
      totalCustomers: 0,
      totalTicketsSold: 0,
    };
  }
}

export async function getAllCustomers(filters?: {
  search?: string;
  status?: string;
}): Promise<CustomerSummary[]> {
  try {
    let whereClause = '1=1';
    const params: unknown[] = [];

    if (filters?.search && filters.search.trim()) {
      const q = `%${filters.search.trim()}%`;
      whereClause += ' AND (o.customer_phone LIKE ? OR o.customer_name LIKE ? OR o.customer_state LIKE ?)';
      params.push(q, q, q);
    }

    const query = `
      SELECT
        o.customer_phone,
        MAX(o.customer_name) as customer_name,
        MAX(o.customer_state) as customer_state,
        COUNT(o.id) as total_orders_count,
        SUM(CASE WHEN o.status = 'completed' THEN o.total_amount ELSE 0 END) as total_spent,
        SUM(CASE WHEN o.status = 'completed' THEN 1 ELSE 0 END) as completed_orders_count,
        SUM(CASE WHEN o.status IN ('pending_payment', 'in_review') THEN 1 ELSE 0 END) as pending_orders_count,
        SUM(CASE WHEN o.status IN ('cancelled', 'expired') THEN 1 ELSE 0 END) as cancelled_orders_count,
        SUM(CASE WHEN o.status = 'completed' THEN o.ticket_count ELSE 0 END) as total_tickets,
        MIN(o.created_at) as first_order_at,
        MAX(o.created_at) as last_order_at,
        bc.reason as block_reason,
        bc.created_at as blocked_at,
        CASE WHEN bc.id IS NOT NULL THEN 1 ELSE 0 END as is_blocked
      FROM orders o
      LEFT JOIN blocked_customers bc ON bc.phone = o.customer_phone
      WHERE ${whereClause}
      GROUP BY o.customer_phone, bc.id, bc.reason, bc.created_at
      ORDER BY total_spent DESC, last_order_at DESC
    `;

    const [rows] = await pool.query<RowDataPacket[]>(query, params);

    let results = rows.map((r) => ({
      block_reason: r.block_reason || null,
      blocked_at: r.blocked_at || null,
      cancelled_orders_count: Number(r.cancelled_orders_count || 0),
      completed_orders_count: Number(r.completed_orders_count || 0),
      customer_name: r.customer_name || 'Sin nombre',
      customer_phone: r.customer_phone,
      customer_state: r.customer_state || null,
      first_order_at: r.first_order_at,
      is_blocked: Boolean(r.is_blocked),
      last_order_at: r.last_order_at,
      pending_orders_count: Number(r.pending_orders_count || 0),
      total_orders_count: Number(r.total_orders_count || 0),
      total_spent: Number(r.total_spent || 0),
      total_tickets: Number(r.total_tickets || 0),
    }));

    if (filters?.status === 'blocked') {
      results = results.filter((c) => c.is_blocked);
    } else if (filters?.status === 'active') {
      results = results.filter((c) => !c.is_blocked && c.completed_orders_count > 0);
    }

    return results;
  } catch (error) {
    logger.db.error('Error al listar clientes:', error);
    return [];
  }
}

export async function getCustomerDetail(phone: string): Promise<CustomerDetail | null> {
  try {
    const cleanPhone = phone.trim();

    const [summaryRows] = await pool.query<RowDataPacket[]>(
      `SELECT
        o.customer_phone,
        MAX(o.customer_name) as customer_name,
        MAX(o.customer_state) as customer_state,
        COUNT(o.id) as total_orders_count,
        SUM(CASE WHEN o.status = 'completed' THEN o.total_amount ELSE 0 END) as total_spent,
        SUM(CASE WHEN o.status = 'completed' THEN 1 ELSE 0 END) as completed_orders_count,
        SUM(CASE WHEN o.status IN ('pending_payment', 'in_review') THEN 1 ELSE 0 END) as pending_orders_count,
        SUM(CASE WHEN o.status IN ('cancelled', 'expired') THEN 1 ELSE 0 END) as cancelled_orders_count,
        SUM(CASE WHEN o.status = 'completed' THEN o.ticket_count ELSE 0 END) as total_tickets,
        MIN(o.created_at) as first_order_at,
        MAX(o.created_at) as last_order_at,
        bc.reason as block_reason,
        bc.created_at as blocked_at,
        CASE WHEN bc.id IS NOT NULL THEN 1 ELSE 0 END as is_blocked
      FROM orders o
      LEFT JOIN blocked_customers bc ON bc.phone = o.customer_phone
      WHERE o.customer_phone = ?
      GROUP BY o.customer_phone, bc.id, bc.reason, bc.created_at`,
      [cleanPhone]
    );

    if (summaryRows.length === 0) return null;

    const r = summaryRows[0];
    const customer: CustomerSummary = {
      block_reason: r.block_reason || null,
      blocked_at: r.blocked_at || null,
      cancelled_orders_count: Number(r.cancelled_orders_count || 0),
      completed_orders_count: Number(r.completed_orders_count || 0),
      customer_name: r.customer_name || 'Sin nombre',
      customer_phone: r.customer_phone,
      customer_state: r.customer_state || null,
      first_order_at: r.first_order_at,
      is_blocked: Boolean(r.is_blocked),
      last_order_at: r.last_order_at,
      pending_orders_count: Number(r.pending_orders_count || 0),
      total_orders_count: Number(r.total_orders_count || 0),
      total_spent: Number(r.total_spent || 0),
      total_tickets: Number(r.total_tickets || 0),
    };

    const [orderRows] = await pool.query<RowDataPacket[]>(
      `SELECT
        o.id,
        o.uuid,
        o.giveaway_id,
        g.title as giveaway_title,
        g.uuid as giveaway_uuid,
        o.ticket_count,
        o.ticket_numbers,
        o.total_amount,
        o.currency,
        o.status,
        o.concept_reference,
        o.tracking_key,
        o.receipt_filename,
        o.is_winner,
        o.created_at
      FROM orders o
      INNER JOIN giveaways g ON g.id = o.giveaway_id
      WHERE o.customer_phone = ?
      ORDER BY o.created_at DESC`,
      [cleanPhone]
    );

    const orders: CustomerOrderSummary[] = orderRows.map((ord) => {
      let parsedTickets: number[] = [];
      try {
        parsedTickets = typeof ord.ticket_numbers === 'string' ? JSON.parse(ord.ticket_numbers) : (ord.ticket_numbers || []);
      } catch (_) {
        parsedTickets = [];
      }

      return {
        concept_reference: ord.concept_reference,
        created_at: ord.created_at,
        currency: ord.currency || 'MXN',
        giveaway_id: ord.giveaway_id,
        giveaway_title: ord.giveaway_title,
        giveaway_uuid: ord.giveaway_uuid,
        id: ord.id,
        is_winner: Number(ord.is_winner || 0),
        receipt_filename: ord.receipt_filename,
        status: ord.status,
        ticket_count: ord.ticket_count,
        ticket_numbers: parsedTickets,
        total_amount: Number(ord.total_amount || 0),
        tracking_key: ord.tracking_key,
        uuid: ord.uuid,
      };
    });

    return { customer, orders };
  } catch (error) {
    logger.db.error('Error al obtener detalle del cliente:', error);
    return null;
  }
}

export async function blockCustomer(phone: string, reason: string, customerName?: string): Promise<void> {
  const cleanPhone = phone.trim();
  const cleanReason = (reason || '').trim() || 'Bloqueado por el administrador por actividad sospechosa.';

  if (!cleanPhone) {
    throw new Error('El número telefónico es requerido.');
  }

  try {
    await pool.query(
      `INSERT INTO blocked_customers (phone, customer_name, reason, blocked_by)
       VALUES (?, ?, ?, 'admin')
       ON DUPLICATE KEY UPDATE reason = VALUES(reason), customer_name = COALESCE(VALUES(customer_name), customer_name)`,
      [cleanPhone, customerName || null, cleanReason]
    );
  } catch (error) {
    logger.db.error('Error al bloquear cliente:', error);
    throw error;
  }
}

export async function unblockCustomer(phone: string): Promise<void> {
  const cleanPhone = phone.trim();
  try {
    await pool.query(`DELETE FROM blocked_customers WHERE phone = ?`, [cleanPhone]);
  } catch (error) {
    logger.db.error('Error al desbloquear cliente:', error);
    throw error;
  }
}
