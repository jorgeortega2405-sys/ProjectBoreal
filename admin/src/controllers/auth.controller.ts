import { config } from '../config/env.config.js';
import { extractSessionToken } from '../middlewares/auth.middleware.js';
import { authService } from '../services/auth.service.js';
import { logger } from '../services/logger.service.js';
import { Request, Response } from 'express';

function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded) {
    return forwarded.split(',')[0].trim();
  }
  if (Array.isArray(forwarded) && forwarded.length > 0) {
    return forwarded[0].trim();
  }
  return req.socket.remoteAddress || req.ip || '127.0.0.1';
}

export class AuthController {
  async login(req: Request, res: Response): Promise<void> {
    try {
      const { email, password } = req.body || {};

      if (!email || !password || typeof email !== 'string' || typeof password !== 'string') {
        res.status(400).json({
          error: 'Por favor ingresa tu correo electrónico y contraseña.',
          success: false,
        });
        return;
      }

      const ip = getClientIp(req);
      const userAgent = req.headers['user-agent'] || 'unknown';

      const { sessionToken, user } = await authService.login(email, password, ip, userAgent);

      res.cookie('boreal_admin_session', sessionToken, {
        httpOnly: true,
        maxAge: 7 * 24 * 60 * 60 * 1000,
        path: '/',
        sameSite: 'lax',
        secure: config.nodeEnv === 'production',
      });

      res.status(200).json({
        data: {
          token: sessionToken,
          user,
        },
        message: 'Inicio de sesión exitoso.',
        success: true,
      });
    } catch (err: any) {
      const msg = err?.message || '';
      if (
        msg.includes('incorrectos') ||
        msg.includes('inválidas') ||
        msg.includes('desactivada') ||
        msg.includes('intentos')
      ) {
        res.status(400).json({
          error: msg,
          success: false,
        });
        return;
      }

      logger.app.error('Error inesperado durante login de admin', err);
      res.status(500).json({
        error: 'Ha ocurrido un error inesperado al procesar la solicitud. Por favor intenta más tarde.',
        success: false,
      });
    }
  }

  async me(req: Request, res: Response): Promise<void> {
    try {
      const token = extractSessionToken(req);
      if (!token) {
        res.status(401).json({
          error: 'No autenticado.',
          success: false,
        });
        return;
      }

      const user = await authService.verifySession(token);
      if (!user) {
        res.status(401).json({
          error: 'Sesión expirada o inválida.',
          success: false,
        });
        return;
      }

      res.status(200).json({
        data: { user },
        success: true,
      });
    } catch (err) {
      logger.app.error('Error al verificar sesión de admin', err);
      res.status(500).json({
        error: 'Ha ocurrido un error inesperado al procesar la solicitud. Por favor intenta más tarde.',
        success: false,
      });
    }
  }

  async logout(req: Request, res: Response): Promise<void> {
    try {
      const token = extractSessionToken(req);
      if (token) {
        await authService.logout(token);
      }

      res.clearCookie('boreal_admin_session', {
        httpOnly: true,
        path: '/',
        sameSite: 'lax',
        secure: config.nodeEnv === 'production',
      });

      res.status(200).json({
        message: 'Sesión cerrada exitosamente.',
        success: true,
      });
    } catch (err) {
      logger.app.error('Error al cerrar sesión de admin', err);
      res.status(500).json({
        error: 'Ha ocurrido un error inesperado al procesar la solicitud. Por favor intenta más tarde.',
        success: false,
      });
    }
  }
}

export const authController = new AuthController();
export default authController;
