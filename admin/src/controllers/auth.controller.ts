import { Request, Response } from 'express';
import { RowDataPacket } from 'mysql2';
import { poolIdentity } from '../config/database.config.js';
import { config } from '../config/env.config.js';
import { ADMIN_COOKIE_NAME, createSessionToken, isSessionRevoked, logAdminAudit, revokeSession, SESSION_TTL_SECONDS, storeSession, verifyPassword, verifySessionToken } from '../services/auth.service.js';
import { logger } from '../services/logger.service.js';
import { AdminSafeUser, AdminUser, AuthenticatedAdminRequest } from '../types/auth.types.js';

export async function login(req: Request, res: Response): Promise<void> {
  const ipAddress = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip || '';
  const userAgent = req.headers['user-agent'] || '';

  try {
    const { email, password } = req.body || {};

    if (!email || !password || typeof email !== 'string' || typeof password !== 'string') {
      res.status(400).json({ error: 'Por favor ingresa un correo y contraseña válidos.' });
      return;
    }

    const cleanEmail = email.trim().toLowerCase();

    const [rows] = await poolIdentity.query<RowDataPacket[]>(
      'SELECT id, uuid, email, password_hash, name, is_active FROM admin_users WHERE email = ? LIMIT 1',
      [cleanEmail]
    );

    if (rows.length === 0) {
      await logAdminAudit({
        action: 'ADMIN_LOGIN_FAILED',
        details: { email: cleanEmail, reason: 'user_not_found' },
        ipAddress,
        userAgent,
      });
      res.status(401).json({ error: 'Credenciales inválidas o cuenta deshabilitada.' });
      return;
    }

    const admin = rows[0] as AdminUser;

    if (!admin.is_active) {
      await logAdminAudit({
        action: 'ADMIN_LOGIN_FAILED',
        details: { email: cleanEmail, reason: 'account_inactive' },
        ipAddress,
        userAgent,
      });
      res.status(401).json({ error: 'Credenciales inválidas o cuenta deshabilitada.' });
      return;
    }

    const isValidPassword = await verifyPassword(password, admin.password_hash);
    if (!isValidPassword) {
      await logAdminAudit({
        action: 'ADMIN_LOGIN_FAILED',
        details: { email: cleanEmail, reason: 'invalid_password' },
        ipAddress,
        userAgent,
      });
      res.status(401).json({ error: 'Credenciales inválidas o cuenta deshabilitada.' });
      return;
    }

    const safeUser: AdminSafeUser = {
      email: admin.email,
      id: admin.id,
      name: admin.name,
      uuid: admin.uuid,
    };

    const token = createSessionToken(safeUser);
    await storeSession(token, safeUser);

    await logAdminAudit({
      action: 'ADMIN_LOGIN_SUCCESS',
      adminUser: safeUser,
      ipAddress,
      userAgent,
    });

    res.cookie(ADMIN_COOKIE_NAME, token, {
      httpOnly: true,
      maxAge: SESSION_TTL_SECONDS * 1000,
      path: '/',
      sameSite: 'strict',
      secure: config.nodeEnv === 'production',
    });

    res.status(200).json({
      authenticated: true,
      user: safeUser,
    });
  } catch (err) {
    logger.security.error('Error en proceso de login de Admin', err);
    res.status(500).json({
      error: 'Ha ocurrido un error inesperado al procesar la solicitud. Por favor intenta más tarde.',
    });
  }
}

export async function me(req: AuthenticatedAdminRequest, res: Response): Promise<void> {
  try {
    const token = req.cookies?.[ADMIN_COOKIE_NAME];
    if (!token) {
      res.status(200).json({ authenticated: false, user: null });
      return;
    }

    const payload = verifySessionToken(token);
    if (!payload) {
      res.status(200).json({ authenticated: false, user: null });
      return;
    }

    const revoked = await isSessionRevoked(token);
    if (revoked) {
      res.status(200).json({ authenticated: false, user: null });
      return;
    }

    const [userRows] = await poolIdentity.query<RowDataPacket[]>(
      'SELECT is_active FROM admin_users WHERE id = ? LIMIT 1',
      [payload.id]
    );
    if (userRows.length === 0 || !userRows[0].is_active) {
      res.status(200).json({ authenticated: false, user: null });
      return;
    }

    res.status(200).json({
      authenticated: true,
      user: {
        email: payload.email,
        id: payload.id,
        name: payload.name,
        uuid: payload.uuid,
      },
    });
  } catch (err) {
    logger.app.error('Error al verificar sesión me de Admin', err);
    res.status(500).json({
      error: 'Ha ocurrido un error inesperado al procesar la solicitud. Por favor intenta más tarde.',
    });
  }
}

export async function logout(req: AuthenticatedAdminRequest, res: Response): Promise<void> {
  const ipAddress = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip || '';
  const userAgent = req.headers['user-agent'] || '';

  try {
    const token = req.cookies?.[ADMIN_COOKIE_NAME];
    if (token) {
      await revokeSession(token);
    }

    await logAdminAudit({
      action: 'ADMIN_LOGOUT',
      adminUser: req.adminUser || null,
      ipAddress,
      userAgent,
    });

    res.clearCookie(ADMIN_COOKIE_NAME, {
      httpOnly: true,
      path: '/',
      sameSite: 'strict',
      secure: config.nodeEnv === 'production',
    });

    res.status(200).json({ success: true });
  } catch (err) {
    logger.security.error('Error en logout de Admin', err);
    res.status(500).json({
      error: 'Ha ocurrido un error inesperado al procesar la solicitud. Por favor intenta más tarde.',
    });
  }
}
