import { isCassandraConnected } from '../config/cassandra.config.js';
import { poolIdentity, poolLottery } from '../config/database.config.js';
import { redis } from '../config/redis.config.js';
import { logger } from '../services/logger.service.js';
import { Request, Response } from 'express';

export async function getAdminHealthStatus(_req: Request, res: Response): Promise<void> {
  let dbHealthy = false;
  let redisHealthy = false;

  try {
    const [lotteryPing, identityPing] = await Promise.all([
      poolLottery.query('SELECT 1'),
      poolIdentity.query('SELECT 1'),
    ]);
    dbHealthy = Boolean(lotteryPing && identityPing);
  } catch (err) {
    logger.app.error('Fallo de comprobación en MySQL para Admin', err);
    dbHealthy = false;
  }

  try {
    const pong = await redis.ping();
    redisHealthy = pong === 'PONG';
  } catch (err) {
    logger.app.error('Fallo de comprobación en Redis para Admin', err);
    redisHealthy = false;
  }

  const cassandraHealthy = isCassandraConnected;

  const isHealthy = dbHealthy && redisHealthy;
  const statusCode = isHealthy ? 200 : 503;

  res.status(statusCode).json({
    services: {
      cassandra: cassandraHealthy ? 'up' : 'degraded',
      database: dbHealthy ? 'up' : 'down',
      redis: redisHealthy ? 'up' : 'down',
    },
    status: !isHealthy ? 'unhealthy' : !cassandraHealthy ? 'degraded' : 'healthy',
    timestamp: new Date().toISOString(),
  });
}
