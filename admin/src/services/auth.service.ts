import bcrypt from 'bcryptjs';
import cassandra, { types } from 'cassandra-driver';
import crypto from 'crypto';
import { AdminSafeUser, AdminSessionPayload } from '../types/auth.types.js';
import { cassandraClient, isCassandraConnected } from '../config/cassandra.config.js';
import { config } from '../config/env.config.js';
import { logger } from './logger.service.js';
import { redis } from '../config/redis.config.js';

export const ADMIN_COOKIE_NAME = 'boreal_admin_session';
export const SESSION_TTL_SECONDS = 24 * 60 * 60;
const SESSION_PREFIX = 'boreal:admin_session:';
const REVOCATION_PREFIX = 'boreal:admin_revoked:';

export async function hashPassword(password: string): Promise<string> {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(password, salt);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function createSessionToken(user: AdminSafeUser): string {
  const now = Math.floor(Date.now() / 1000);
  const payload: AdminSessionPayload = {
    email: user.email,
    exp: now + SESSION_TTL_SECONDS,
    iat: now,
    id: user.id,
    name: user.name,
    uuid: user.uuid,
  };
  const payloadStr = JSON.stringify(payload);
  const payloadBase64 = Buffer.from(payloadStr, 'utf-8').toString('base64url');
  const signature = crypto.createHmac('sha256', config.sessionSecret).update(payloadBase64).digest('base64url');
  return `${payloadBase64}.${signature}`;
}

export function verifySessionToken(token: string): AdminSessionPayload | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 2) return null;
    const [payloadBase64, signature] = parts;
    const expectedSignature = crypto.createHmac('sha256', config.sessionSecret).update(payloadBase64).digest('base64url');
    if (signature !== expectedSignature) return null;

    const payloadStr = Buffer.from(payloadBase64, 'base64url').toString('utf-8');
    const payload = JSON.parse(payloadStr) as AdminSessionPayload;
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) return null;
    return payload;
  } catch {
    return null;
  }
}

export async function storeSession(token: string, user: AdminSafeUser): Promise<void> {
  try {
    if (redis.status === 'ready' || redis.status === 'connect') {
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
      await redis.set(`${SESSION_PREFIX}${tokenHash}`, JSON.stringify(user), 'EX', SESSION_TTL_SECONDS);
    }
  } catch (err) {
    logger.security.warn('Error al guardar sesión en Redis para Admin', err);
  }
}

export async function isSessionRevoked(token: string): Promise<boolean> {
  try {
    if (redis.status === 'ready' || redis.status === 'connect') {
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
      const revoked = await redis.get(`${REVOCATION_PREFIX}${tokenHash}`);
      return revoked === '1';
    }
    return false;
  } catch {
    return false;
  }
}

export async function revokeSession(token: string): Promise<void> {
  try {
    if (redis.status === 'ready' || redis.status === 'connect') {
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
      await redis.del(`${SESSION_PREFIX}${tokenHash}`);
      await redis.set(`${REVOCATION_PREFIX}${tokenHash}`, '1', 'EX', SESSION_TTL_SECONDS);
    }
  } catch (err) {
    logger.security.warn('Error al revocar sesión en Redis para Admin', err);
  }
}

export async function logAdminAudit(params: {
  action: string;
  adminUser?: AdminSafeUser | null;
  details?: Record<string, unknown>;
  ipAddress: string;
  userAgent: string;
}): Promise<void> {
  const auditUuid = crypto.randomUUID();
  const timeId = types.TimeUuid.now();
  const now = new Date();
  const bucketMonth = now.toISOString().slice(0, 7);
  const adminName = params.adminUser?.name || params.adminUser?.email || 'Admin';
  const detailsJson = params.details ? JSON.stringify(params.details) : null;
  const ip = params.ipAddress.slice(0, 45);
  const ua = params.userAgent.slice(0, 500);

  try {
    if (isCassandraConnected) {
      const queries = [
        {
          params: [
            auditUuid,
            timeId,
            null,
            null,
            null,
            adminName,
            params.action,
            'admin',
            ip,
            ua,
            null,
            null,
            null,
            null,
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
            null,
            null,
            null,
            adminName,
            params.action,
            'admin',
            ip,
            ua,
            null,
            null,
            null,
            null,
            detailsJson,
          ],
          query: `INSERT INTO audit_logs_timeline (
            bucket_month, created_at, id, uuid, order_id, order_uuid,
            customer_phone, customer_name, action, actor_type, ip_address, user_agent,
            previous_status, new_status, amount, currency, details
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        },
      ];
      await cassandraClient.batch(queries, { prepare: true });
    }

    logger.security.info(`ADMIN AUDIT: [${params.action}] User: ${adminName}`, {
      action: params.action,
      adminUser: params.adminUser?.email,
      details: params.details,
      ipAddress: ip,
      uuid: auditUuid,
    });
  } catch (err) {
    logger.security.error('Fallo al registrar log de auditoría para Admin en Cassandra', err);
  }
}
