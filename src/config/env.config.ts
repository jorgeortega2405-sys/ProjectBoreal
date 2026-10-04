import 'dotenv/config';

export const config = {
  banxicoSandbox: process.env.BANXICO_SANDBOX === 'true',
  cluster: {
    enabled: process.env.CLUSTER_ENABLED === 'true',
    workers: parseInt(process.env.CLUSTER_WORKERS || '0', 10),
  },
  db: {
    connectionLimit: parseInt(process.env.DB_CONNECTION_LIMIT || '20', 10),
    host: process.env.DB_HOST || '127.0.0.1',
    name: process.env.DB_NAME || 'db_boreal',
    password: process.env.DB_PASSWORD || '',
    port: parseInt(process.env.DB_PORT || '3306', 10),
    queueLimit: parseInt(process.env.DB_QUEUE_LIMIT || '500', 10),
    user: process.env.DB_USER || 'root',
  },
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3000', 10),
  redis: {
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
  },
  websocket: {
    host: process.env.WEBSOCKET_HOST || '127.0.0.1',
    port: parseInt(process.env.WEBSOCKET_PORT || '3005', 10),
  },
};
