import { pool } from '../config/database.config.js';
import { AuditLogRecord, CreateAuditLogInput } from '../types/audit.types.js';
import { logger } from './logger.service.js';
import crypto from 'crypto';
import { RowDataPacket } from 'mysql2/promise';

interface AuditLogRow extends RowDataPacket, Omit<AuditLogRecord, 'details'> {
  details: string | Record<string, unknown> | null;
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

function mapAuditRow(row: AuditLogRow): AuditLogRecord {
  return {
    action: row.action,
    actor_type: row.actor_type,
    amount: row.amount !== null ? Number(row.amount) : null,
    created_at: String(row.created_at),
    currency: row.currency,
    customer_name: row.customer_name,
    customer_phone: row.customer_phone,
    details: parseAuditDetails(row.details),
    id: Number(row.id),
    ip_address: row.ip_address,
    new_status: row.new_status,
    order_id: row.order_id !== null ? Number(row.order_id) : null,
    order_uuid: row.order_uuid,
    previous_status: row.previous_status,
    user_agent: row.user_agent,
    uuid: row.uuid,
  };
}

export async function recordAudit(input: CreateAuditLogInput): Promise<void> {
  const auditUuid = crypto.randomUUID();
  const actorType = input.actor_type ?? 'customer';
  const ipAddress = input.ip_address ?? '';
  const userAgent = input.user_agent ?? '';
  const detailsJson = input.details ? JSON.stringify(input.details) : null;

  try {
    await pool.query(
      `INSERT INTO user_audit_logs (
        uuid, order_id, order_uuid, customer_phone, customer_name,
        action, actor_type, ip_address, user_agent,
        previous_status, new_status, amount, currency, details
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        auditUuid,
        input.order_id ?? null,
        input.order_uuid ?? null,
        input.customer_phone ?? null,
        input.customer_name ?? null,
        input.action,
        actorType,
        ipAddress,
        userAgent,
        input.previous_status ?? null,
        input.new_status ?? null,
        input.amount ?? null,
        input.currency ?? null,
        detailsJson,
      ]
    );

    logger.security.info(`AUDIT: [${input.action}] Order: ${input.order_uuid ?? 'N/A'} Actor: ${actorType}`, {
      action: input.action,
      actorType,
      amount: input.amount,
      customerPhone: input.customer_phone,
      details: input.details,
      ipAddress,
      newStatus: input.new_status,
      orderUuid: input.order_uuid,
      previousStatus: input.previous_status,
      uuid: auditUuid,
    });
  } catch (error) {
    logger.db.error(`Fallo crítico al registrar auditoría [${input.action}] para orden ${input.order_uuid ?? 'N/A'}`, error);
  }
}

export async function getOrderAuditTrail(orderUuid: string): Promise<AuditLogRecord[]> {
  try {
    const [rows] = await pool.query<AuditLogRow[]>(
      `SELECT id, uuid, order_id, order_uuid, customer_phone, customer_name,
              action, actor_type, ip_address, user_agent,
              previous_status, new_status, amount, currency, details, created_at
       FROM user_audit_logs
       WHERE order_uuid = ?
       ORDER BY id ASC`,
      [orderUuid]
    );
    return rows.map(mapAuditRow);
  } catch (error) {
    logger.db.error(`Fallo al consultar pista de auditoría de orden ${orderUuid}`, error);
    return [];
  }
}

export async function getCustomerAuditHistory(phone: string): Promise<AuditLogRecord[]> {
  try {
    const [rows] = await pool.query<AuditLogRow[]>(
      `SELECT id, uuid, order_id, order_uuid, customer_phone, customer_name,
              action, actor_type, ip_address, user_agent,
              previous_status, new_status, amount, currency, details, created_at
       FROM user_audit_logs
       WHERE customer_phone = ?
       ORDER BY id DESC
       LIMIT 100`,
      [phone]
    );
    return rows.map(mapAuditRow);
  } catch (error) {
    logger.db.error(`Fallo al consultar historial de auditoría de cliente ${phone}`, error);
    return [];
  }
}

export const auditService = {
  getCustomerAuditHistory,
  getOrderAuditTrail,
  record: recordAudit,
};
