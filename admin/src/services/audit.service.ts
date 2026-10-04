import { AuditActorType, AuditLogRecord, AuditLogsResponse } from '../types/audit.types.js';
import { logger } from './logger.service.js';
import { pool } from '../config/database.config.js';
import { RowDataPacket } from 'mysql2/promise';

interface AuditLogRow extends RowDataPacket {
  action: string;
  actor_type: AuditActorType;
  amount: number | null;
  created_at: Date | string;
  currency: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  details: string | Record<string, unknown> | null;
  id: number;
  ip_address: string;
  new_status: string | null;
  order_id: number | null;
  order_uuid: string | null;
  previous_status: string | null;
  user_agent: string;
  uuid: string;
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

export async function getAdminAuditLogs(options: {
  action?: string;
  actorType?: string;
  limit?: number;
  page?: number;
  search?: string;
} = {}): Promise<AuditLogsResponse> {
  const page = Math.max(1, Number(options.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(options.limit) || 30));
  const offset = (page - 1) * limit;

  const whereConditions: string[] = [];
  const params: unknown[] = [];

  if (options.actorType && options.actorType !== 'all') {
    whereConditions.push('actor_type = ?');
    params.push(options.actorType);
  }

  if (options.action && options.action.trim()) {
    whereConditions.push('action = ?');
    params.push(options.action.trim());
  }

  if (options.search && options.search.trim()) {
    const term = `%${options.search.trim()}%`;
    whereConditions.push(
      '(customer_name LIKE ? OR customer_phone LIKE ? OR order_uuid LIKE ? OR ip_address LIKE ? OR action LIKE ?)'
    );
    params.push(term, term, term, term, term);
  }

  const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

  try {
    const [countRows] = await pool.query<RowDataPacket[]>(
      `SELECT COUNT(*) AS total FROM user_audit_logs ${whereClause}`,
      params
    );

    const total = Number(countRows[0]?.total || 0);
    const totalPages = Math.ceil(total / limit) || 1;

    const [rows] = await pool.query<AuditLogRow[]>(
      `SELECT id, uuid, order_id, order_uuid, customer_phone, customer_name,
              action, actor_type, ip_address, user_agent, previous_status,
              new_status, CAST(amount AS DOUBLE) AS amount, currency, details, created_at
       FROM user_audit_logs
       ${whereClause}
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    const logs: AuditLogRecord[] = rows.map((r) => ({
      action: r.action,
      actor_type: r.actor_type,
      amount: r.amount !== null ? Number(r.amount) : null,
      created_at: new Date(r.created_at).toISOString(),
      currency: r.currency,
      customer_name: r.customer_name,
      customer_phone: r.customer_phone,
      details: parseAuditDetails(r.details),
      id: Number(r.id),
      ip_address: r.ip_address,
      new_status: r.new_status,
      order_id: r.order_id !== null ? Number(r.order_id) : null,
      order_uuid: r.order_uuid,
      previous_status: r.previous_status,
      user_agent: r.user_agent,
      uuid: r.uuid,
    }));

    return { logs, page, total, totalPages };
  } catch (error) {
    logger.db.error('Error al consultar registros de auditoría en backend admin', error);
    throw new Error('Error al consultar el registro de auditoría.');
  }
}

export async function getAdminAuditLogDetail(uuid: string): Promise<AuditLogRecord | null> {
  try {
    const [rows] = await pool.query<AuditLogRow[]>(
      `SELECT id, uuid, order_id, order_uuid, customer_phone, customer_name,
              action, actor_type, ip_address, user_agent, previous_status,
              new_status, CAST(amount AS DOUBLE) AS amount, currency, details, created_at
       FROM user_audit_logs
       WHERE uuid = ?
       LIMIT 1`,
      [uuid]
    );

    if (rows.length === 0) return null;
    const r = rows[0];

    return {
      action: r.action,
      actor_type: r.actor_type,
      amount: r.amount !== null ? Number(r.amount) : null,
      created_at: new Date(r.created_at).toISOString(),
      currency: r.currency,
      customer_name: r.customer_name,
      customer_phone: r.customer_phone,
      details: parseAuditDetails(r.details),
      id: Number(r.id),
      ip_address: r.ip_address,
      new_status: r.new_status,
      order_id: r.order_id !== null ? Number(r.order_id) : null,
      order_uuid: r.order_uuid,
      previous_status: r.previous_status,
      user_agent: r.user_agent,
      uuid: r.uuid,
    };
  } catch (error) {
    logger.db.error(`Error al consultar detalle de auditoría ${uuid}`, error);
    throw new Error('Error al consultar el detalle de auditoría.');
  }
}
