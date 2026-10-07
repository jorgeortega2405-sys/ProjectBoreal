import { pool } from '../config/database.config.js';
import { redis } from '../config/redis.config.js';
import { logger } from '../services/logger.service.js';
import { Request, Response, Router } from 'express';

const router = Router();

router.get('/', async (_req: Request, res: Response): Promise<void> => {
  let dbStatus = 'disconnected';
  let redisStatus = 'disconnected';

  try {
    const [rows] = await pool.query('SELECT 1');
    if (rows) {
      dbStatus = 'connected';
    }
  } catch (err) {
    logger.app.debug('Estado de base de datos MySQL en healthcheck admin:', err);
  }

  try {
    if (redis.status === 'ready' || redis.status === 'connect') {
      const pong = await redis.ping();
      if (pong === 'PONG') {
        redisStatus = 'connected';
      }
    }
  } catch (err) {
    logger.app.debug('Estado de Redis en healthcheck admin:', err);
  }

  const mem = process.memoryUsage();
  res.status(200).json({
    memory: {
      heapUsedMb: Math.round(mem.heapUsed / 1024 / 1024),
      rssMb: Math.round(mem.rss / 1024 / 1024),
    },
    services: {
      database: dbStatus,
      redis: redisStatus,
    },
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
  });
});

export default router;
