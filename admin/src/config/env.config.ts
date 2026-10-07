import 'dotenv/config';

export const config = {
  cors: {
    allowedOrigins: (process.env.ALLOWED_ORIGINS || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  },
  db: {
    connectionLimit: parseInt(process.env.DB_CONNECTION_LIMIT || '20', 10),
    host: process.env.DB_LOTTERY_HOST || process.env.DB_HOST || '127.0.0.1',
    name: process.env.DB_LOTTERY_NAME || process.env.DB_NAME || 'db_lottery',
    password: process.env.DB_LOTTERY_PASSWORD || process.env.DB_PASSWORD || '',
    port: parseInt(process.env.DB_LOTTERY_PORT || process.env.DB_PORT || '3306', 10),
    queueLimit: parseInt(process.env.DB_QUEUE_LIMIT || '500', 10),
    user: process.env.DB_LOTTERY_USER || process.env.DB_USER || '',
  },
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.ADMIN_PORT || process.env.PORT || '3001', 10),
  redis: {
    host: process.env.REDIS_HOST || '127.0.0.1',
    password: process.env.REDIS_PASSWORD || undefined,
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
  },
};

const ALLOWED_ORIGIN_REGEX = /^https?:\/\/(?:[a-zA-Z0-9-]+\.)*(?:projectboreal\.com|boreal\.com|boreal\.local)(?::\d+)?$/;

export function isAllowedOrigin(origin: string | undefined): boolean {
  if (!origin || typeof origin !== 'string') return false;
  if (
    origin.startsWith('http://localhost:') ||
    origin.startsWith('https://localhost:') ||
    origin.startsWith('http://127.0.0.1:') ||
    origin === 'http://localhost' ||
    origin === 'https://localhost' ||
    origin === 'http://127.0.0.1' ||
    origin.endsWith('.projectboreal.internal') ||
    ALLOWED_ORIGIN_REGEX.test(origin)
  ) {
    return true;
  }
  return config.cors.allowedOrigins.some((allowed) => origin === allowed);
}
