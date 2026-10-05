import { isCassandraConnected } from '../config/cassandra.config.js';
import { poolIdentity, poolLottery } from '../config/database.config.js';
import { config } from '../config/env.config.js';
import { redis } from '../config/redis.config.js';
import { logger } from '../services/logger.service.js';
import { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';

export async function getHealthStatus(_req: Request, res: Response): Promise<void> {
  let dbHealthy = false;
  let redisHealthy = false;

  try {
    const [lotteryPing, identityPing] = await Promise.all([
      poolLottery.query('SELECT 1'),
      poolIdentity.query('SELECT 1'),
    ]);
    dbHealthy = Boolean(lotteryPing && identityPing);
  } catch (err) {
    logger.app.error('Fallo de comprobación en MySQL', err);
    dbHealthy = false;
  }

  try {
    const pong = await redis.ping();
    redisHealthy = pong === 'PONG';
  } catch (err) {
    logger.app.error('Fallo de comprobación en Redis', err);
    redisHealthy = false;
  }

  let websocketHealthy = false;
  try {
    const wsController = new AbortController();
    const timeoutId = setTimeout(() => wsController.abort(), 2000);
    const wsRes = await fetch(`http://${config.websocket.host}:${config.websocket.port}/health`, {
      signal: wsController.signal,
    });
    clearTimeout(timeoutId);
    websocketHealthy = wsRes.ok;
  } catch {
    websocketHealthy = false;
  }

  let workerStatus = 'down';
  try {
    const heartbeatRaw = await redis.get('boreal:worker:heartbeat');
    if (heartbeatRaw) {
      const heartbeat = JSON.parse(heartbeatRaw);
      const ageSeconds = Date.now() / 1000 - Number(heartbeat.timestamp || 0);
      workerStatus = ageSeconds <= 45 ? 'up' : 'stale';
    }
  } catch {
    workerStatus = 'unknown';
  }

  let storageHealthy = false;
  try {
    const storageDir = path.join(process.cwd(), 'storage', 'receipts');
    await fs.promises.access(storageDir, fs.constants.W_OK);
    storageHealthy = true;
  } catch {
    storageHealthy = false;
  }

  const cassandraHealthy = isCassandraConnected;
  const isCoreHealthy = dbHealthy && redisHealthy;
  const isFullyHealthy = isCoreHealthy && cassandraHealthy && websocketHealthy && workerStatus === 'up' && storageHealthy;
  const statusCode = isCoreHealthy ? 200 : 503;

  const mem = process.memoryUsage();
  const memoryInfo = {
    heapUsedMb: Math.round(mem.heapUsed / 1024 / 1024),
    rssMb: Math.round(mem.rss / 1024 / 1024),
  };

  res.status(statusCode).json({
    memory: memoryInfo,
    services: {
      cassandra: cassandraHealthy ? 'up' : 'degraded',
      database: dbHealthy ? 'up' : 'down',
      paymentWorker: workerStatus,
      redis: redisHealthy ? 'up' : 'down',
      storage: storageHealthy ? 'up' : 'down',
      websocket: websocketHealthy ? 'up' : 'down',
    },
    status: !isCoreHealthy ? 'unhealthy' : !isFullyHealthy ? 'degraded' : 'healthy',
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
  });
}
