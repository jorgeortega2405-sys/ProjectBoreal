import { authService } from '../services/auth.service.js';
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
