import dotenv from 'dotenv';
import path from 'path';

const adminEnvPath = path.resolve(import.meta.dirname, '../../.env');
const rootEnvPath = path.resolve(import.meta.dirname, '../../../.env');

dotenv.config({ path: rootEnvPath });
dotenv.config({ override: true, path: adminEnvPath });

export const config = {
  db: {
    connectionLimit: Number(process.env.DB_CONNECTION_LIMIT) || 10,
    host: process.env.DB_HOST || '127.0.0.1',
    name: process.env.DB_NAME || 'db_boreal',
    password: process.env.DB_PASSWORD || 'sprite_password',
    port: Number(process.env.DB_PORT) || 3306,
    queueLimit: Number(process.env.DB_QUEUE_LIMIT) || 0,
    user: process.env.DB_USER || 'sprite_user',
  },
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.ADMIN_PORT) || 3005,
  redis: {
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: Number(process.env.REDIS_PORT) || 6379,
  },
  sessionSecret: process.env.SESSION_SECRET || 'boreal_admin_super_secret_session_key_2026',
};
