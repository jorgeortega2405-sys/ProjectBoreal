import 'dotenv/config';

export const config = {
  cassandra: {
    contactPoints: (process.env.CASSANDRA_CONTACT_POINTS || '127.0.0.1').split(',').map((s) => s.trim()),
    keyspace: process.env.CASSANDRA_KEYSPACE || 'boreal_audit',
    localDataCenter: process.env.CASSANDRA_LOCAL_DC || 'datacenter1',
    password: process.env.CASSANDRA_PASSWORD || '',
    port: parseInt(process.env.CASSANDRA_PORT || '9042', 10),
    user: process.env.CASSANDRA_USER || '',
  },
  cluster: {
    enabled: process.env.CLUSTER_ENABLED === 'true',
    workers: parseInt(process.env.CLUSTER_WORKERS || '0', 10),
  },
  cors: {
    allowedOrigins: (process.env.ALLOWED_ORIGINS || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  },
  db: {
    connectionLimit: parseInt(process.env.DB_CONNECTION_LIMIT || '20', 10),
    host: process.env.DB_LOTTERY_HOST || process.env.DB_HOST || '127.0.0.1',
    lottery: {
      connectionLimit: parseInt(process.env.DB_LOTTERY_CONNECTION_LIMIT || process.env.DB_CONNECTION_LIMIT || '20', 10),
      host: process.env.DB_LOTTERY_HOST || process.env.DB_HOST || '127.0.0.1',
      name: process.env.DB_LOTTERY_NAME || process.env.DB_NAME || 'db_lottery',
      password: process.env.DB_LOTTERY_PASSWORD || process.env.DB_PASSWORD || '',
      port: parseInt(process.env.DB_LOTTERY_PORT || process.env.DB_PORT || '3306', 10),
      queueLimit: parseInt(process.env.DB_LOTTERY_QUEUE_LIMIT || process.env.DB_QUEUE_LIMIT || '500', 10),
      user: process.env.DB_LOTTERY_USER || process.env.DB_USER || '',
    },
    name: process.env.DB_LOTTERY_NAME || process.env.DB_NAME || 'db_lottery',
    password: process.env.DB_LOTTERY_PASSWORD || process.env.DB_PASSWORD || '',
    port: parseInt(process.env.DB_LOTTERY_PORT || process.env.DB_PORT || '3306', 10),
    queueLimit: parseInt(process.env.DB_QUEUE_LIMIT || '500', 10),
    user: process.env.DB_LOTTERY_USER || process.env.DB_USER || '',
  },
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3000', 10),
  redis: {
    host: process.env.REDIS_HOST || '127.0.0.1',
    password: process.env.REDIS_PASSWORD || undefined,
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
  },
  s3: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID || 'boreal_s3_access',
    bucket: process.env.S3_BUCKET || 'boreal-storage',
    endpoint: process.env.S3_ENDPOINT || 'http://127.0.0.1:9000',
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== 'false',
    publicUrl: process.env.S3_PUBLIC_URL || '',
    region: process.env.S3_REGION || 'us-east-1',
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || 'boreal_s3_secret_2026',
  },
  websocket: {
    host: process.env.WEBSOCKET_HOST || '127.0.0.1',
    port: parseInt(process.env.WEBSOCKET_PORT || '3008', 10),
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
