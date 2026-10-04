import { logger } from '../services/logger.service.js';
import { NextFunction, Request, Response } from 'express';

export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();
  const path = req.originalUrl || req.url;

  if (
    path.startsWith('/@') ||
    path.startsWith('/node_modules') ||
    path.startsWith('/client') ||
    path.match(/\.(css|js|map|svg|png|jpg|jpeg|webp|woff2|woff|ttf|ico)$/)
  ) {
    return next();
  }

  res.on('finish', () => {
    const duration = Date.now() - start;
    const statusCode = res.statusCode;
    const ip = req.ip || req.socket.remoteAddress || 'unknown';

    if (statusCode >= 500) {
      logger.app.error(`HTTP ${req.method} ${path} respondio ${statusCode} (${duration}ms)`, { ip, statusCode });
    } else if (statusCode === 401 || statusCode === 403 || statusCode === 429) {
      logger.security.warn(`HTTP ${req.method} ${path} bloqueado con ${statusCode} (${duration}ms)`, { ip, statusCode });
    } else if (path.startsWith('/api')) {
      logger.app.info(`HTTP ${req.method} ${path} ${statusCode} (${duration}ms)`, { ip, statusCode });
    }
  });

  next();
}
