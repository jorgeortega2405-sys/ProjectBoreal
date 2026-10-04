import { config } from './env.config.js';
import { logger } from '../services/logger.service.js';
import { Redis } from 'ioredis';

export const redis = new Redis({
  host: config.redis.host,
  lazyConnect: true,
  maxRetriesPerRequest: 3,
  port: config.redis.port,
  retryStrategy(times) {
    return Math.min(times * 100, 2000);
  },
});

redis.on('error', (err) => {
  logger.db.warn('Advertencia en cliente Redis de Admin:', err);
});

export async function checkRedisConnection(retries = 5, delayMs = 1000): Promise<void> {
  for (let i = 1; i <= retries; i++) {
    try {
      if (redis.status !== 'ready' && redis.status !== 'connecting') {
        await redis.connect();
      }
      const pong = await redis.ping();
      if (pong === 'PONG') {
        logger.db.info('Conexión establecida exitosamente con Redis para Admin.');
        return;
      }
    } catch (err) {
      logger.db.warn(`Esperando a Redis en ${config.redis.host}:${config.redis.port} (intento ${i}/${retries})...`);
      if (i === retries) {
        logger.db.error('No se pudo conectar a Redis para Admin después de múltiples intentos.', err);
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

export async function publishGiveawayEvent(channel: string, payload: unknown): Promise<void> {
  try {
    if (redis.status === 'ready' || redis.status === 'connect') {
      await redis.publish(channel, JSON.stringify(payload));
    }
  } catch (err) {
    logger.db.warn('Error al publicar evento en Redis desde Admin', err);
  }
}

export async function deleteCache(key: string): Promise<void> {
  try {
    if (redis.status === 'ready' || redis.status === 'connect') {
      await redis.del(`boreal:cache:${key}`);
    }
  } catch (err) {
    logger.db.warn(`Fallo al eliminar clave de caché boreal:cache:${key} desde Admin`, err);
  }
}

export async function deleteCachePattern(pattern: string): Promise<void> {
  try {
    if (redis.status !== 'ready' && redis.status !== 'connect') {
      return;
    }
    const stream = redis.scanStream({
      count: 100,
      match: `boreal:cache:${pattern}`,
    });
    const keys: string[] = [];
    for await (const batch of stream) {
      keys.push(...(batch as string[]));
    }
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  } catch (err) {
    logger.db.warn(`Fallo al invalidar patrón de caché boreal:cache:${pattern} desde Admin`, err);
  }
}

export default redis;
