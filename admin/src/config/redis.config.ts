import { logger } from '../services/logger.service.js';
import { config } from './env.config.js';
import { Redis } from 'ioredis';

export const redis = new Redis({
  host: config.redis.host,
  lazyConnect: true,
  maxRetriesPerRequest: 3,
  password: config.redis.password,
  port: config.redis.port,
  retryStrategy(times) {
    return Math.min(times * 100, 2000);
  },
});

redis.on('error', (err) => {
  logger.db.warn('Advertencia en cliente Redis Admin:', err);
});

export async function checkRedisConnection(retries = 5, delayMs = 1000): Promise<void> {
  for (let i = 1; i <= retries; i++) {
    try {
      if (redis.status !== 'ready' && redis.status !== 'connecting') {
        await redis.connect();
      }
      const pong = await redis.ping();
      if (pong === 'PONG') {
        logger.db.info('Conexión establecida exitosamente con Redis Admin.');
        return;
      }
    } catch (err) {
      logger.db.warn(`Esperando a Redis en ${config.redis.host}:${config.redis.port} (intento ${i}/${retries})...`);
      if (i === retries) {
        logger.db.warn('No se pudo conectar a Redis en admin. Continuando en modo desacoplado.');
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

export async function closeRedisConnection(): Promise<void> {
  try {
    if (redis.status === 'ready' || redis.status === 'connect') {
      await redis.quit();
    }
    logger.db.info('Conexión a Redis Admin cerrada exitosamente.');
  } catch (err) {
    logger.db.warn('Error al cerrar cliente Redis Admin', err);
  }
}

export default redis;
