import { pool } from '../config/database.config.js';
import { redis } from '../config/redis.config.js';
import { AdminSession, AdminUserRow, SafeAdminUser } from '../types/auth.types.js';
import { generateSessionToken, verifyPassword } from '../utils/crypto.util.js';
import { logger } from './logger.service.js';
import { getAdminEffectivePermissions, getAdminRoles } from './roles.service.js';

const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;
const RATE_LIMIT_MAX_ATTEMPTS = 5;
const RATE_LIMIT_WINDOW_SECONDS = 60 * 15;
const memorySessions = new Map<string, { expiresAt: number; session: AdminSession }>();
const memoryRateLimits = new Map<string, { count: number; resetAt: number }>();

export class AuthService {
  private getSessionKey(token: string): string {
    return `admin:session:${token}`;
  }

  private getRateLimitKey(ip: string, email: string): string {
    const cleanIp = (ip || 'unknown').replace(/[^a-zA-Z0-9:.]/g, '');
    const cleanEmail = (email || 'unknown').toLowerCase().trim();
    return `admin:login_limit:${cleanIp}:${cleanEmail}`;
  }

  private async checkRateLimit(ip: string, email: string): Promise<boolean> {
    const key = this.getRateLimitKey(ip, email);
    try {
      if (redis.status === 'ready') {
        const attempts = await redis.get(key);
        if (attempts && parseInt(attempts, 10) >= RATE_LIMIT_MAX_ATTEMPTS) {
          return false;
        }
        return true;
      }
    } catch {}

    const now = Date.now();
    const mem = memoryRateLimits.get(key);
    if (mem) {
      if (now > mem.resetAt) {
        memoryRateLimits.delete(key);
        return true;
      }
      if (mem.count >= RATE_LIMIT_MAX_ATTEMPTS) {
        return false;
      }
    }
    return true;
  }

  private async recordFailedAttempt(ip: string, email: string): Promise<void> {
    const key = this.getRateLimitKey(ip, email);
    try {
      if (redis.status === 'ready') {
        const current = await redis.incr(key);
        if (current === 1) {
          await redis.expire(key, RATE_LIMIT_WINDOW_SECONDS);
        }
        return;
      }
    } catch {}

    const now = Date.now();
    const mem = memoryRateLimits.get(key);
    if (!mem || now > mem.resetAt) {
      memoryRateLimits.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_SECONDS * 1000 });
    } else {
      mem.count += 1;
    }
  }

  private async clearRateLimit(ip: string, email: string): Promise<void> {
    const key = this.getRateLimitKey(ip, email);
    try {
      if (redis.status === 'ready') {
        await redis.del(key);
      }
    } catch {}
    memoryRateLimits.delete(key);
  }

  async login(
    email: string,
    password: string,
    ip: string,
    userAgent: string
  ): Promise<{ sessionToken: string; user: SafeAdminUser }> {
    const normalizedEmail = (email || '').trim().toLowerCase();
    if (!normalizedEmail || !password) {
      throw new Error('Credenciales inválidas.');
    }

    const isAllowed = await this.checkRateLimit(ip, normalizedEmail);
    if (!isAllowed) {
      logger.security.warn(`Bloqueo por exceso de intentos de login para IP [${ip}] y usuario [${normalizedEmail}]`);
      throw new Error('Demasiados intentos fallidos. Por favor espera 15 minutos antes de volver a intentar.');
    }

    const [rows] = await pool.query<AdminUserRow[]>(
      'SELECT id, uuid, name, email, password_hash, is_active FROM admin_users WHERE email = ? LIMIT 1',
      [normalizedEmail]
    );

    if (rows.length === 0) {
      await this.recordFailedAttempt(ip, normalizedEmail);
      logger.security.warn(`Intento de login fallido (usuario no existe): [${normalizedEmail}] desde IP [${ip}]`);
      throw new Error('Correo electrónico o contraseña incorrectos.');
    }

    const admin = rows[0];

    if (!admin.is_active) {
      logger.security.warn(`Intento de login en cuenta inactiva: [${normalizedEmail}] ID [${admin.id}]`);
      throw new Error('Esta cuenta de administrador se encuentra desactivada.');
    }

    const isPasswordValid = await verifyPassword(password, admin.password_hash);
    if (!isPasswordValid) {
      await this.recordFailedAttempt(ip, normalizedEmail);
      logger.security.warn(`Intento de login fallido (contraseña incorrecta): [${normalizedEmail}] desde IP [${ip}]`);
      throw new Error('Correo electrónico o contraseña incorrectos.');
    }

    await this.clearRateLimit(ip, normalizedEmail);

    const [roles, permissions] = await Promise.all([
      getAdminRoles(admin.id),
      getAdminEffectivePermissions(admin.id),
    ]);

    const sessionToken = generateSessionToken();
    const sessionData: AdminSession = {
      createdAt: Date.now(),
      email: admin.email,
      id: admin.id,
      ip,
      name: admin.name,
      permissions,
      roles,
      userAgent,
      uuid: admin.uuid,
    };

    const redisKey = this.getSessionKey(sessionToken);
    try {
      if (redis.status === 'ready') {
        await redis.set(redisKey, JSON.stringify(sessionData), 'EX', SESSION_TTL_SECONDS);
      }
    } catch (err) {
      logger.db.warn('Fallo al persistir sesión admin en Redis. Almacenando en memoria.', err);
    }

    memorySessions.set(sessionToken, {
      expiresAt: Date.now() + SESSION_TTL_SECONDS * 1000,
      session: sessionData,
    });

    void pool
      .query('UPDATE admin_users SET last_login_at = NOW() WHERE id = ?', [admin.id])
      .catch((err) => {
        logger.db.warn('No se pudo actualizar last_login_at para admin', err);
      });

    logger.security.info(`Login exitoso de administrador: [${admin.email}] ID [${admin.id}] desde IP [${ip}]`, {
      permissionsCount: permissions.length,
      roles,
    });

    return {
      sessionToken,
      user: {
        email: admin.email,
        id: admin.id,
        name: admin.name,
        permissions,
        roles,
        uuid: admin.uuid,
      },
    };
  }

  async verifySession(sessionToken: string): Promise<SafeAdminUser | null> {
    if (!sessionToken || typeof sessionToken !== 'string') {
      return null;
    }

    let baseSession: AdminSession | null = null;
    const redisKey = this.getSessionKey(sessionToken);

    try {
      if (redis.status === 'ready') {
        const raw = await redis.get(redisKey);
        if (raw) {
          baseSession = JSON.parse(raw) as AdminSession;
        }
      }
    } catch {}

    if (!baseSession) {
      const mem = memorySessions.get(sessionToken);
      if (mem) {
        if (Date.now() > mem.expiresAt) {
          memorySessions.delete(sessionToken);
          return null;
        }
        baseSession = mem.session;
      }
    }

    if (!baseSession) {
      return null;
    }

    const [roles, permissions] = await Promise.all([
      getAdminRoles(baseSession.id),
      getAdminEffectivePermissions(baseSession.id),
    ]);

    return {
      email: baseSession.email,
      id: baseSession.id,
      name: baseSession.name,
      permissions,
      roles,
      uuid: baseSession.uuid,
    };
  }

  async logout(sessionToken: string): Promise<void> {
    if (!sessionToken || typeof sessionToken !== 'string') {
      return;
    }

    const redisKey = this.getSessionKey(sessionToken);
    try {
      if (redis.status === 'ready') {
        await redis.del(redisKey);
      }
    } catch {}

    memorySessions.delete(sessionToken);
  }
}

export const authService = new AuthService();
export default authService;
