import { cassandraClient, isCassandraConnected, markCassandraDisconnected } from '../config/cassandra.config.js';
import { logger } from './logger.service.js';

export interface AuditEventItem {
  action: string;
  actor_type: string;
  amount: number | null;
  amount_formatted: string | null;
  created_at: string;
  currency: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  details: Record<string, unknown> | null;
  id: string;
  ip_address: string;
  new_status: string | null;
  order_id: number | null;
  order_uuid: string | null;
  previous_status: string | null;
  user_agent: string;
  uuid: string;
}

export interface AuditKpis {
  adminActionsCount: number;
  customersInvolved: number;
  ordersAudited: number;
  totalEvents: number;
}

function parseAuditDetails(raw: unknown): Record<string, unknown> | null {
  if (!raw) return null;
  if (typeof raw === 'object') return raw as Record<string, unknown>;
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
  return null;
}

function formatAuditAmount(amount: any, currency = 'MXN'): string | null {
  if (amount === null || amount === undefined) return null;
  const num = typeof amount === 'number' ? amount : Number(amount.toString ? amount.toString() : amount);
  if (isNaN(num)) return null;
  return new Intl.NumberFormat('es-MX', {
    currency: currency || 'MXN',
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
    style: 'currency',
  }).format(num);
}

function mapRow(row: any): AuditEventItem {
  const rawAmount = row.amount ? Number(row.amount.toString ? row.amount.toString() : row.amount) : null;
  const currency = row.currency ? String(row.currency) : 'MXN';
  return {
    action: String(row.action || ''),
    actor_type: String(row.actor_type || 'customer'),
    amount: rawAmount,
    amount_formatted: formatAuditAmount(rawAmount, currency),
    created_at: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at || new Date().toISOString()),
    currency,
    customer_name: row.customer_name ? String(row.customer_name) : null,
    customer_phone: row.customer_phone ? String(row.customer_phone) : null,
    details: parseAuditDetails(row.details),
    id: row.id ? String(row.id) : '',
    ip_address: String(row.ip_address || ''),
    new_status: row.new_status ? String(row.new_status) : null,
    order_id: row.order_id ? Number(row.order_id) : null,
    order_uuid: row.order_uuid ? String(row.order_uuid) : null,
    previous_status: row.previous_status ? String(row.previous_status) : null,
    user_agent: String(row.user_agent || ''),
    uuid: String(row.uuid || ''),
  };
}

export class AuditService {
  getAvailableMonths(): string[] {
    const months: string[] = [];
    const now = new Date();
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      months.push(`${yyyy}-${mm}`);
    }
    return months;
  }

  async getAuditTimeline(params: {
    action?: string;
    actorType?: string;
    limit?: number;
    month?: string;
    search?: string;
  }): Promise<{ events: AuditEventItem[]; isConnected: boolean; month: string }> {
    const currentMonth = new Date().toISOString().slice(0, 7);
    const targetMonth = params.month || currentMonth;
    const limit = Math.min(Math.max(params.limit || 50, 10), 200);

    if (!isCassandraConnected) {
      return { events: [], isConnected: false, month: targetMonth };
    }

    try {
      const query = `
        SELECT bucket_month, created_at, id, uuid, order_id, order_uuid,
               customer_phone, customer_name, action, actor_type, ip_address, user_agent,
               previous_status, new_status, amount, currency, details
        FROM audit_logs_timeline
        WHERE bucket_month = ?
        LIMIT ?
      `;

      const result = await cassandraClient.execute(query, [targetMonth, limit], { prepare: true });
      let events = result.rows.map(mapRow);

      if (params.action && params.action !== 'all') {
        events = events.filter((e) => e.action === params.action);
      }

      if (params.actorType && params.actorType !== 'all') {
        events = events.filter((e) => e.actor_type === params.actorType);
      }

      if (params.search) {
        const q = params.search.toLowerCase().trim();
        events = events.filter(
          (e) =>
            e.uuid.toLowerCase().includes(q) ||
            (e.order_uuid && e.order_uuid.toLowerCase().includes(q)) ||
            (e.customer_phone && e.customer_phone.includes(q)) ||
            (e.customer_name && e.customer_name.toLowerCase().includes(q)) ||
            (e.ip_address && e.ip_address.includes(q))
        );
      }

      return {
        events,
        isConnected: true,
        month: targetMonth,
      };
    } catch (error) {
      markCassandraDisconnected();
      logger.db.error('Error al consultar línea de tiempo de auditoría en Cassandra', error);
      return { events: [], isConnected: false, month: targetMonth };
    }
  }

  async getAuditKpis(month?: string): Promise<AuditKpis> {
    const targetMonth = month || new Date().toISOString().slice(0, 7);
    if (!isCassandraConnected) {
      return {
        adminActionsCount: 0,
        customersInvolved: 0,
        ordersAudited: 0,
        totalEvents: 0,
      };
    }

    try {
      const query = `
        SELECT order_uuid, customer_phone, actor_type
        FROM audit_logs_timeline
        WHERE bucket_month = ?
        LIMIT 500
      `;

      const result = await cassandraClient.execute(query, [targetMonth], { prepare: true });
      const orders = new Set<string>();
      const customers = new Set<string>();
      let adminActions = 0;

      for (const row of result.rows) {
        if (row.order_uuid) orders.add(String(row.order_uuid));
        if (row.customer_phone) customers.add(String(row.customer_phone));
        if (row.actor_type === 'admin') adminActions++;
      }

      return {
        adminActionsCount: adminActions,
        customersInvolved: customers.size,
        ordersAudited: orders.size,
        totalEvents: result.rows.length,
      };
    } catch (error) {
      logger.db.error('Error al calcular KPIs de auditoría', error);
      return {
        adminActionsCount: 0,
        customersInvolved: 0,
        ordersAudited: 0,
        totalEvents: 0,
      };
    }
  }

  async getEventByUuid(uuid: string): Promise<AuditEventItem | null> {
    if (!isCassandraConnected || !uuid) return null;

    try {
      const query = `
        SELECT uuid, id, order_id, order_uuid, customer_phone, customer_name,
               action, actor_type, ip_address, user_agent,
               previous_status, new_status, amount, currency, details, created_at
        FROM audit_logs
        WHERE uuid = ?
      `;

      const result = await cassandraClient.execute(query, [uuid], { prepare: true });
      if (result.rows.length === 0) return null;
      return mapRow(result.rows[0]);
    } catch (error) {
      logger.db.error('Error al buscar evento de auditoría por UUID', { error, uuid });
      return null;
    }
  }

  async getOrderAuditTrail(orderUuid: string): Promise<AuditEventItem[]> {
    if (!isCassandraConnected || !orderUuid) return [];

    try {
      const query = `
        SELECT order_uuid, created_at, id, uuid, order_id, customer_phone, customer_name,
               action, actor_type, ip_address, user_agent,
               previous_status, new_status, amount, currency, details
        FROM audit_logs_by_order
        WHERE order_uuid = ?
      `;

      const result = await cassandraClient.execute(query, [orderUuid], { prepare: true });
      return result.rows.map(mapRow);
    } catch (error) {
      logger.db.error('Error al consultar pista de orden en Cassandra', { error, orderUuid });
      return [];
    }
  }
}

export const auditService = new AuditService();
