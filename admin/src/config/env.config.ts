import dotenv from 'dotenv';
import path from 'path';

const adminEnvPath = path.resolve(import.meta.dirname, '../../.env');
const rootEnvPath = path.resolve(import.meta.dirname, '../../../.env');

dotenv.config({ path: rootEnvPath });
dotenv.config({ override: true, path: adminEnvPath });

export const config = {
  cassandra: {
    contactPoints: (process.env.CASSANDRA_CONTACT_POINTS || '127.0.0.1').split(',').map((s) => s.trim()),
    keyspace: process.env.CASSANDRA_KEYSPACE || 'boreal_audit',
    localDataCenter: process.env.CASSANDRA_LOCAL_DC || 'datacenter1',
    password: process.env.CASSANDRA_PASSWORD || '',
    port: Number(process.env.CASSANDRA_PORT) || 9042,
    user: process.env.CASSANDRA_USER || '',
  },
  db: {
    connectionLimit: Number(process.env.DB_CONNECTION_LIMIT) || 10,
    host: process.env.DB_LOTTERY_HOST || process.env.DB_HOST || '127.0.0.1',
    identity: {
      connectionLimit: Number(process.env.DB_IDENTITY_CONNECTION_LIMIT || process.env.DB_CONNECTION_LIMIT) || 10,
      host: process.env.DB_IDENTITY_HOST || process.env.DB_HOST || '127.0.0.1',
      name: process.env.DB_IDENTITY_NAME || 'db_identity',
      password: process.env.DB_IDENTITY_PASSWORD || process.env.DB_PASSWORD || 'sprite_password',
      port: Number(process.env.DB_IDENTITY_PORT || process.env.DB_PORT) || 3306,
      queueLimit: Number(process.env.DB_IDENTITY_QUEUE_LIMIT) || 0,
      user: process.env.DB_IDENTITY_USER || process.env.DB_USER || 'sprite_user',
    },
    lottery: {
      connectionLimit: Number(process.env.DB_LOTTERY_CONNECTION_LIMIT || process.env.DB_CONNECTION_LIMIT) || 10,
      host: process.env.DB_LOTTERY_HOST || process.env.DB_HOST || '127.0.0.1',
      name: process.env.DB_LOTTERY_NAME || process.env.DB_NAME || 'db_lottery',
      password: process.env.DB_LOTTERY_PASSWORD || process.env.DB_PASSWORD || 'sprite_password',
      port: Number(process.env.DB_LOTTERY_PORT || process.env.DB_PORT) || 3306,
      queueLimit: Number(process.env.DB_LOTTERY_QUEUE_LIMIT) || 0,
      user: process.env.DB_LOTTERY_USER || process.env.DB_USER || 'sprite_user',
    },
    name: process.env.DB_LOTTERY_NAME || process.env.DB_NAME || 'db_lottery',
    password: process.env.DB_LOTTERY_PASSWORD || process.env.DB_PASSWORD || 'sprite_password',
    port: Number(process.env.DB_LOTTERY_PORT || process.env.DB_PORT) || 3306,
    queueLimit: Number(process.env.DB_QUEUE_LIMIT) || 0,
    user: process.env.DB_LOTTERY_USER || process.env.DB_USER || 'sprite_user',
  },
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.ADMIN_PORT) || 3005,
  redis: {
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: Number(process.env.REDIS_PORT) || 6379,
  },
  sessionSecret: process.env.SESSION_SECRET || 'boreal_admin_super_secret_session_key_2026',
};
