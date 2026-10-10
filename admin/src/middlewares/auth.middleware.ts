import { authService } from '../services/auth.service.js';
import { logger } from '../services/logger.service.js';
import { SafeAdminUser } from '../types/auth.types.js';
import { NextFunction, Request, Response } from 'express';

declare global {
  namespace Express {
    interface Request {
      adminUser?: SafeAdminUser;
    }
  }
}

export function parseCookies(header: string | undefined): Record<string, string> {
  const list: Record<string, string> = {};
  if (!header || typeof header !== 'string') return list;

  header.split(';').forEach((cookie) => {
    const parts = cookie.split('=');
    const name = parts.shift()?.trim();
    if (name) {
      list[name] = decodeURIComponent(parts.join('=').trim());
    }
  });

  return list;
}

export function extractSessionToken(req: Request): string | null {
  const cookies = parseCookies(req.headers.cookie);
  if (cookies['boreal_admin_session']) {
    return cookies['boreal_admin_session'];
  }

  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7).trim();
  }

  return null;
}

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const token = extractSessionToken(req);

  if (!token) {
    res.status(401).json({
      error: 'No autorizado. Se requiere iniciar sesión.',
      success: false,
    });
    return;
  }

  const user = await authService.verifySession(token);
  if (!user) {
    res.status(401).json({
      error: 'Sesión inválida o expirada. Por favor inicia sesión nuevamente.',
      success: false,
    });
    return;
  }

  req.adminUser = user;
  next();
}

export function hasPermission(user: SafeAdminUser | undefined, permission: string): boolean {
  if (!user || !Array.isArray(user.permissions) || user.permissions.length === 0) return false;
  return user.permissions.includes(permission) || user.permissions.includes('*');
}

export function hasAnyPermission(user: SafeAdminUser | undefined, permissions: string[]): boolean {
  if (!user || !Array.isArray(user.permissions) || user.permissions.length === 0) return false;
  if (user.permissions.includes('*')) return true;
  return permissions.some((p) => user.permissions.includes(p));
}

export function hasAllPermissions(user: SafeAdminUser | undefined, permissions: string[]): boolean {
  if (!user || !Array.isArray(user.permissions) || user.permissions.length === 0) return false;
  if (user.permissions.includes('*')) return true;
  return permissions.every((p) => user.permissions.includes(p));
}

export function requirePermission(...neededPerms: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = req.adminUser;
    if (!user) {
      res.status(401).json({
        error: 'No autorizado. Se requiere iniciar sesión.',
        success: false,
      });
      return;
    }

    if (!hasAnyPermission(user, neededPerms)) {
      logger.security.warn('Acceso denegado por falta de permiso PBAC en Admin', {
        adminId: user.id,
        email: user.email,
        method: req.method,
        neededPerms,
        path: req.originalUrl,
      });
      res.status(403).json({
        error: 'Acceso denegado: permisos insuficientes para realizar esta operación.',
        success: false,
      });
      return;
    }

    next();
  };
}

export function requireAllPermissions(...neededPerms: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = req.adminUser;
    if (!user) {
      res.status(401).json({
        error: 'No autorizado. Se requiere iniciar sesión.',
        success: false,
      });
      return;
    }

    if (!hasAllPermissions(user, neededPerms)) {
      logger.security.warn('Acceso denegado por falta de permisos compuestos PBAC en Admin', {
        adminId: user.id,
        email: user.email,
        method: req.method,
        neededPerms,
        path: req.originalUrl,
      });
      res.status(403).json({
        error: 'Acceso denegado: permisos insuficientes para realizar esta operación.',
        success: false,
      });
      return;
    }

    next();
  };
}
