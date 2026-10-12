import { NextFunction, Response } from 'express';
import { RowDataPacket } from 'mysql2/promise';
import { poolIdentity } from '../config/database.config.js';
import { redis } from '../config/redis.config.js';
import { ADMIN_COOKIE_NAME, isSessionRevoked, verifySessionToken } from '../services/auth.service.js';
import { logger } from '../services/logger.service.js';
import { AuthenticatedAdminRequest } from '../types/auth.types.js';

interface PermissionRow extends RowDataPacket {
  slug: string;
}

export async function invalidateUserPermissionsCache(adminUserId?: number): Promise<void> {
  try {
    if (redis.status === 'ready' || redis.status === 'connect') {
      if (adminUserId) {
        await redis.del(`boreal:admin_perms:${adminUserId}`);
      } else {
        const keys = await redis.keys('boreal:admin_perms:*');
        if (keys.length > 0) {
          await redis.del(...keys);
        }
      }
    }
  } catch (err) {
    logger.app.warn('Error al invalidar caché de permisos en Redis', err);
  }
}

export async function getUserPermissions(adminUserId: number): Promise<string[]> {
  const cacheKey = `boreal:admin_perms:${adminUserId}`;
  try {
    if (redis.status === 'ready' || redis.status === 'connect') {
      const cached = await redis.get(cacheKey);
      if (cached) {
        return JSON.parse(cached) as string[];
      }
    }
  } catch {}

  const [rows] = await poolIdentity.query<PermissionRow[]>(
    `SELECT DISTINCT p.slug
     FROM permissions p
     INNER JOIN role_permissions rp ON rp.permission_id = p.id
     INNER JOIN admin_user_roles aur ON aur.role_id = rp.role_id
     WHERE aur.admin_user_id = ?`,
    [adminUserId]
  );

  const permissions = rows.map((r) => r.slug);

  try {
    if (redis.status === 'ready' || redis.status === 'connect') {
      await redis.set(cacheKey, JSON.stringify(permissions), 'EX', 60);
    }
  } catch {}

  return permissions;
}

export async function requireAdminAuth(req: AuthenticatedAdminRequest, res: Response, next: NextFunction): Promise<void> {
  const token = req.cookies?.[ADMIN_COOKIE_NAME];
  if (!token) {
    res.status(401).json({ error: 'No autorizado. Por favor inicia sesión.' });
    return;
  }

  const payload = verifySessionToken(token);
  if (!payload) {
    res.status(401).json({ error: 'Sesión inválida o expirada.' });
    return;
  }

  const revoked = await isSessionRevoked(token);
  if (revoked) {
    res.status(401).json({ error: 'La sesión ha sido revocada.' });
    return;
  }

  const [userRows] = await poolIdentity.query<RowDataPacket[]>(
    'SELECT is_active FROM admin_users WHERE id = ? LIMIT 1',
    [payload.id]
  );
  if (userRows.length === 0 || !userRows[0].is_active) {
    res.status(401).json({ error: 'La cuenta ha sido deshabilitada por el administrador.' });
    return;
  }

  req.adminUser = {
    email: payload.email,
    id: payload.id,
    name: payload.name,
    uuid: payload.uuid,
  };

  next();
}

export function requirePermission(permissionSlug: string) {
  return async (req: AuthenticatedAdminRequest, res: Response, next: NextFunction): Promise<void> => {
    if (!req.adminUser?.id) {
      res.status(401).json({ error: 'No autorizado. Por favor inicia sesión.' });
      return;
    }

    try {
      const permissions = await getUserPermissions(req.adminUser.id);
      req.adminUser.permissions = permissions;

      if (!permissions.includes(permissionSlug)) {
        res.status(403).json({ error: 'No cuentas con los permisos necesarios para realizar esta acción.' });
        return;
      }

      next();
    } catch (err) {
      logger.security.error('Error al verificar permisos PBAC del administrador', err);
      res.status(500).json({
        error: 'Ha ocurrido un error inesperado al procesar la solicitud. Por favor intenta más tarde.',
      });
    }
  };
}
