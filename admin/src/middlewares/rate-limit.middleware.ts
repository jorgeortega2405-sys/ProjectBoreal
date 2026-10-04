import { logger } from '../services/logger.service.js';
import { NextFunction, Request, Response } from 'express';
import { redis } from '../config/redis.config.js';

interface RateLimitOptions {
  keyPrefix: string;
  maxRequests: number;
  message?: string;
  windowSeconds: number;
}

export function createRateLimiter(options: RateLimitOptions) {
  const { keyPrefix, maxRequests, message, windowSeconds } = options;

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const clientIp = req.ip || req.socket.remoteAddress || '127.0.0.1';
      const cleanIp = clientIp.replace(/[^a-zA-Z0-9_.-]/g, '_');
      const redisKey = `boreal:admin:ratelimit:${keyPrefix}:${cleanIp}`;

      if (redis.status !== 'ready' && redis.status !== 'connect') {
        return next();
      }

      const rateScript = `
        local current = redis.call('incr', KEYS[1])
        if current == 1 then
          redis.call('expire', KEYS[1], ARGV[1])
        end
        local ttl = redis.call('ttl', KEYS[1])
        return {current, ttl}
      `;
      const [currentCount, ttl] = (await redis.eval(
        rateScript,
        1,
        redisKey,
        windowSeconds
      )) as [number, number];

      res.setHeader('RateLimit-Limit', String(maxRequests));
      res.setHeader('RateLimit-Remaining', String(Math.max(0, maxRequests - currentCount)));
      res.setHeader('RateLimit-Reset', String(ttl > 0 ? ttl : windowSeconds));

      if (currentCount > maxRequests) {
        res.status(429).json({
          error: message || 'Demasiados intentos de acceso. Por favor espera antes de intentar nuevamente.',
          retryAfter: ttl > 0 ? ttl : windowSeconds,
          success: false,
        });
        return;
      }

      next();
    } catch (err) {
      logger.app.warn('Error al verificar tasa de solicitudes en Redis para Admin', err);
      next();
    }
  };
}
