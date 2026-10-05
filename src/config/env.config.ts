import 'dotenv/config';

export const config = {
  banxicoSandbox: process.env.BANXICO_SANDBOX === 'true',
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
  db: {
    connectionLimit: parseInt(process.env.DB_CONNECTION_LIMIT || '20', 10),
    host: process.env.DB_LOTTERY_HOST || process.env.DB_HOST || '127.0.0.1',
    identity: {
      connectionLimit: parseInt(process.env.DB_IDENTITY_CONNECTION_LIMIT || process.env.DB_CONNECTION_LIMIT || '10', 10),
      host: process.env.DB_IDENTITY_HOST || process.env.DB_HOST || '127.0.0.1',
      name: process.env.DB_IDENTITY_NAME || 'db_identity',
      password: process.env.DB_IDENTITY_PASSWORD || process.env.DB_PASSWORD || '',
      port: parseInt(process.env.DB_IDENTITY_PORT || process.env.DB_PORT || '3306', 10),
      queueLimit: parseInt(process.env.DB_IDENTITY_QUEUE_LIMIT || '100', 10),
      user: process.env.DB_IDENTITY_USER || process.env.DB_USER || '',
    },
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
  websocket: {
    host: process.env.WEBSOCKET_HOST || '127.0.0.1',
    port: parseInt(process.env.WEBSOCKET_PORT || '3005', 10),
  },
};
