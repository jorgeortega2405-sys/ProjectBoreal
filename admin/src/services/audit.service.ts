import { cassandraClient, isCassandraConnected } from '../config/cassandra.config.js';
import { AuditActorType, AuditLogRecord, AuditLogsResponse } from '../types/audit.types.js';
import { logger } from './logger.service.js';

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

function mapCassandraRow(row: any): AuditLogRecord {
  return {
    action: row.action || '',
    actor_type: (row.actor_type as AuditActorType) || 'customer',
    amount: row.amount ? Number(row.amount.toString ? row.amount.toString() : row.amount) : null,
    created_at: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at || new Date().toISOString()),
    currency: row.currency || null,
    customer_name: row.customer_name || null,
    customer_phone: row.customer_phone || null,
    details: parseAuditDetails(row.details),
    id: 0,
    ip_address: row.ip_address || '',
    new_status: row.new_status || null,
    order_id: row.order_id ? Number(row.order_id) : null,
    order_uuid: row.order_uuid || null,
    previous_status: row.previous_status || null,
    user_agent: row.user_agent || '',
    uuid: row.uuid || '',
  };
}

export async function getAdminAuditLogs(options: {
  action?: string;
  actorType?: string;
  limit?: number;
  month?: string;
  page?: number;
  search?: string;
} = {}): Promise<AuditLogsResponse> {
  const page = Math.max(1, Number(options.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(options.limit) || 30));
  const offset = (page - 1) * limit;
  const bucketMonth = options.month && /^\d{4}-\d{2}$/.test(options.month)
    ? options.month
    : new Date().toISOString().slice(0, 7);

  if (!isCassandraConnected) {
    return { logs: [], page, total: 0, totalPages: 1 };
  }

  try {
    const query = `
      SELECT uuid, id, order_id, order_uuid, customer_phone, customer_name,
             action, actor_type, ip_address, user_agent, previous_status,
             new_status, amount, currency, details, created_at
      FROM audit_logs_timeline
      WHERE bucket_month = ?
    `;

    const result = await cassandraClient.execute(query, [bucketMonth], { fetchSize: 200, prepare: true });
    let mapped = result.rows.map(mapCassandraRow);

    if (options.actorType && options.actorType !== 'all') {
      mapped = mapped.filter((r) => r.actor_type === options.actorType);
    }

    if (options.action && options.action.trim()) {
      const act = options.action.trim().toLowerCase();
      mapped = mapped.filter((r) => r.action.toLowerCase() === act);
    }

    if (options.search && options.search.trim()) {
      const term = options.search.trim().toLowerCase();
      mapped = mapped.filter(
        (r) =>
          (r.customer_name && r.customer_name.toLowerCase().includes(term)) ||
          (r.customer_phone && r.customer_phone.toLowerCase().includes(term)) ||
          (r.order_uuid && r.order_uuid.toLowerCase().includes(term)) ||
          (r.ip_address && r.ip_address.toLowerCase().includes(term)) ||
          r.action.toLowerCase().includes(term)
      );
    }

    const total = mapped.length;
    const totalPages = Math.ceil(total / limit) || 1;
    const logs = mapped.slice(offset, offset + limit);

    return { logs, page, total, totalPages };
  } catch (error) {
    logger.db.error('Error al consultar registros de auditoría en Cassandra para Admin', error);
    throw new Error('Error al consultar el registro de auditoría.');
  }
}

export async function getAdminAuditLogDetail(uuid: string): Promise<AuditLogRecord | null> {
  if (!isCassandraConnected) return null;

  try {
    const query = `
      SELECT uuid, id, order_id, order_uuid, customer_phone, customer_name,
             action, actor_type, ip_address, user_agent, previous_status,
             new_status, amount, currency, details, created_at
      FROM audit_logs
      WHERE uuid = ?
      LIMIT 1
    `;

    const result = await cassandraClient.execute(query, [uuid], { prepare: true });
    if (!result.rows || result.rows.length === 0) return null;
    return mapCassandraRow(result.rows[0]);
  } catch (error) {
    logger.db.error(`Error al consultar detalle de auditoría ${uuid} en Cassandra`, error);
    throw new Error('Error al consultar el detalle de auditoría.');
  }
}
