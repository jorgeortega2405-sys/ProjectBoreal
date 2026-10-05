import { config } from './env.config.js';
import { logger } from '../services/logger.service.js';
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
  logger.db.warn('Advertencia en cliente Redis:', err);
});

export async function checkRedisConnection(retries = 5, delayMs = 1000): Promise<void> {
  for (let i = 1; i <= retries; i++) {
    try {
      if (redis.status !== 'ready' && redis.status !== 'connecting') {
        await redis.connect();
      }
      const pong = await redis.ping();
      if (pong === 'PONG') {
        logger.db.info('Conexión establecida exitosamente con Redis.');
        return;
      }
    } catch (err) {
      logger.db.warn(`Esperando a Redis en ${config.redis.host}:${config.redis.port} (intento ${i}/${retries})...`);
      if (i === retries) {
        logger.db.error('No se pudo conectar a Redis después de múltiples intentos.', err);
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
    logger.db.warn('Error al publicar evento en Redis', err);
  }
}

export async function acquireDistributedLock(lockName: string, ttlSeconds: number, lockToken = '1'): Promise<boolean> {
  try {
    if (redis.status !== 'ready' && redis.status !== 'connect') {
      return false;
    }
    const result = await redis.set(`boreal:lock:${lockName}`, lockToken, 'EX', ttlSeconds, 'NX');
    return result === 'OK';
  } catch (err) {
    logger.db.warn(`Fallo al adquirir bloqueo distribuido boreal:lock:${lockName}`, err);
    return false;
  }
}

export async function releaseDistributedLock(lockName: string, lockToken?: string): Promise<void> {
  try {
    if (redis.status !== 'ready' && redis.status !== 'connect') {
      return;
    }
    if (lockToken) {
      const luaScript = `
        if redis.call('get', KEYS[1]) == ARGV[1] then
          return redis.call('del', KEYS[1])
        else
          return 0
        end
      `;
      await redis.eval(luaScript, 1, `boreal:lock:${lockName}`, lockToken);
    } else {
      await redis.del(`boreal:lock:${lockName}`);
    }
  } catch (err) {
    logger.db.warn(`Fallo al liberar bloqueo distribuido boreal:lock:${lockName}`, err);
  }
}

export async function getCache<T>(key: string): Promise<T | null> {
  try {
    if (redis.status !== 'ready' && redis.status !== 'connect') {
      return null;
    }
    const cached = await redis.get(`boreal:cache:${key}`);
    if (!cached) return null;
    return JSON.parse(cached) as T;
  } catch (err) {
    logger.db.warn(`Fallo al leer caché para boreal:cache:${key}`, err);
    return null;
  }
}

export async function setCache(key: string, data: unknown, ttlSeconds: number): Promise<void> {
  try {
    if (redis.status === 'ready' || redis.status === 'connect') {
      await redis.set(`boreal:cache:${key}`, JSON.stringify(data), 'EX', ttlSeconds);
    }
  } catch (err) {
    logger.db.warn(`Fallo al escribir en caché para boreal:cache:${key}`, err);
  }
}

export async function deleteCache(key: string): Promise<void> {
  try {
    if (redis.status === 'ready' || redis.status === 'connect') {
      await redis.del(`boreal:cache:${key}`);
    }
  } catch (err) {
    logger.db.warn(`Fallo al eliminar clave de caché boreal:cache:${key}`, err);
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
    logger.db.warn(`Fallo al invalidar patrón de caché boreal:cache:${pattern}`, err);
  }
}

export async function closeRedisConnection(): Promise<void> {
  try {
    if (redis.status === 'ready' || redis.status === 'connect') {
      await redis.quit();
    }
    logger.db.info('Conexión a Redis cerrada exitosamente.');
  } catch (err) {
    logger.db.warn('Error al cerrar cliente Redis', err);
  }
}

export default redis;

