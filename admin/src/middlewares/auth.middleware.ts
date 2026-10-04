import { ADMIN_COOKIE_NAME, isSessionRevoked, verifySessionToken } from '../services/auth.service.js';
import { AuthenticatedAdminRequest } from '../types/auth.types.js';
import { NextFunction, Response } from 'express';

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

  req.adminUser = {
    email: payload.email,
    id: payload.id,
    name: payload.name,
    uuid: payload.uuid,
  };

  next();
}
