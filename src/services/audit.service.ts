import cassandra, { types } from 'cassandra-driver';
import crypto from 'crypto';
import { cassandraClient, isCassandraConnected } from '../config/cassandra.config.js';
import { logger } from './logger.service.js';
import { AuditLogRecord, CreateAuditLogInput } from '../types/audit.types.js';

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
    actor_type: row.actor_type || 'customer',
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

export async function recordAudit(input: CreateAuditLogInput): Promise<void> {
  const auditUuid = crypto.randomUUID();
  const timeId = types.TimeUuid.now();
  const now = new Date();
  const bucketMonth = now.toISOString().slice(0, 7);
  const actorType = input.actor_type ?? 'customer';
  const ipAddress = input.ip_address ?? '';
  const userAgent = input.user_agent ?? '';
  const detailsJson = input.details ? JSON.stringify(input.details) : null;
  const orderId = input.order_id ? types.Long.fromNumber(input.order_id) : null;
  const amountDecimal = input.amount !== null && input.amount !== undefined ? types.BigDecimal.fromString(String(input.amount)) : null;

  try {
    if (isCassandraConnected) {
      const queries = [
        {
          params: [
            auditUuid,
            timeId,
            orderId,
            input.order_uuid ?? null,
            input.customer_phone ?? null,
            input.customer_name ?? null,
            input.action,
            actorType,
            ipAddress,
            userAgent,
            input.previous_status ?? null,
            input.new_status ?? null,
            amountDecimal,
            input.currency ?? null,
            detailsJson,
            now,
          ],
          query: `INSERT INTO audit_logs (
            uuid, id, order_id, order_uuid, customer_phone, customer_name,
            action, actor_type, ip_address, user_agent,
            previous_status, new_status, amount, currency, details, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        },
        {
          params: [
            bucketMonth,
            now,
            timeId,
            auditUuid,
            orderId,
            input.order_uuid ?? null,
            input.customer_phone ?? null,
            input.customer_name ?? null,
            input.action,
            actorType,
            ipAddress,
            userAgent,
            input.previous_status ?? null,
            input.new_status ?? null,
            amountDecimal,
            input.currency ?? null,
            detailsJson,
          ],
          query: `INSERT INTO audit_logs_timeline (
            bucket_month, created_at, id, uuid, order_id, order_uuid,
            customer_phone, customer_name, action, actor_type, ip_address, user_agent,
            previous_status, new_status, amount, currency, details
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        },
      ];

      if (input.order_uuid) {
        queries.push({
          params: [
            input.order_uuid,
            now,
            timeId,
            auditUuid,
            orderId,
            input.customer_phone ?? null,
            input.customer_name ?? null,
            input.action,
            actorType,
            ipAddress,
            userAgent,
            input.previous_status ?? null,
            input.new_status ?? null,
            amountDecimal,
            input.currency ?? null,
            detailsJson,
          ],
          query: `INSERT INTO audit_logs_by_order (
            order_uuid, created_at, id, uuid, order_id, customer_phone, customer_name,
            action, actor_type, ip_address, user_agent,
            previous_status, new_status, amount, currency, details
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        });
      }

      if (input.customer_phone) {
        queries.push({
          params: [
            input.customer_phone,
            now,
            timeId,
            auditUuid,
            orderId,
            input.order_uuid ?? null,
            input.customer_name ?? null,
            input.action,
            actorType,
            ipAddress,
            userAgent,
            input.previous_status ?? null,
            input.new_status ?? null,
            amountDecimal,
            input.currency ?? null,
            detailsJson,
          ],
          query: `INSERT INTO audit_logs_by_customer (
            customer_phone, created_at, id, uuid, order_id, order_uuid, customer_name,
            action, actor_type, ip_address, user_agent,
            previous_status, new_status, amount, currency, details
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        });
      }

      await cassandraClient.batch(queries, { prepare: true });
    }

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
    logger.db.error(`Fallo crítico al registrar auditoría [${input.action}] en Cassandra`, error);
  }
}

export async function getOrderAuditTrail(orderUuid: string): Promise<AuditLogRecord[]> {
  try {
    if (!isCassandraConnected) return [];
    const query = `
      SELECT uuid, id, order_id, order_uuid, customer_phone, customer_name,
             action, actor_type, ip_address, user_agent,
             previous_status, new_status, amount, currency, details, created_at
      FROM audit_logs_by_order
      WHERE order_uuid = ?
    `;
    const result = await cassandraClient.execute(query, [orderUuid], { prepare: true });
    return result.rows.map(mapCassandraRow);
  } catch (error) {
    logger.db.error(`Fallo al consultar pista de auditoría en Cassandra para orden ${orderUuid}`, error);
    return [];
  }
}

export async function getCustomerAuditHistory(phone: string): Promise<AuditLogRecord[]> {
  try {
    if (!isCassandraConnected) return [];
    const query = `
      SELECT uuid, id, order_id, order_uuid, customer_phone, customer_name,
             action, actor_type, ip_address, user_agent,
             previous_status, new_status, amount, currency, details, created_at
      FROM audit_logs_by_customer
      WHERE customer_phone = ?
      LIMIT 100
    `;
    const result = await cassandraClient.execute(query, [phone], { prepare: true });
    return result.rows.map(mapCassandraRow);
  } catch (error) {
    logger.db.error(`Fallo al consultar historial de cliente en Cassandra para ${phone}`, error);
    return [];
  }
}

export const auditService = {
  getCustomerAuditHistory,
  getOrderAuditTrail,
  record: recordAudit,
};
