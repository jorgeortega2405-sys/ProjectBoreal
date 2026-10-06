import { logger } from '../services/logger.service.js';
import { config } from './env.config.js';
import cassandra from 'cassandra-driver';

const authProvider = config.cassandra.user
  ? new cassandra.auth.PlainTextAuthProvider(config.cassandra.user, config.cassandra.password)
  : undefined;

export const cassandraClient = new cassandra.Client({
  authProvider,
  contactPoints: config.cassandra.contactPoints,
  keyspace: config.cassandra.keyspace,
  localDataCenter: config.cassandra.localDataCenter,
  policies: {
    reconnection: new cassandra.policies.reconnection.ExponentialReconnectionPolicy(1000, 30000),
  },
  protocolOptions: {
    port: config.cassandra.port,
  },
});

export let isCassandraConnected = false;

export function markCassandraDisconnected(): void {
  isCassandraConnected = false;
}

export async function checkCassandraConnection(): Promise<boolean> {
  try {
    await cassandraClient.connect();
    isCassandraConnected = true;
    logger.db.info(`Conexión establecida exitosamente con Apache Cassandra (Keyspace: ${config.cassandra.keyspace}).`);
    return true;
  } catch (err) {
    isCassandraConnected = false;
    logger.db.warn(
      `Apache Cassandra no está disponible en ${config.cassandra.contactPoints.join(',')}:${config.cassandra.port}. Modo de auditoría degradado activo.`
    );
    return false;
  }
}

setInterval(() => {
  if (!isCassandraConnected) {
    checkCassandraConnection().catch(() => {});
  }
}, 60000).unref();

export async function closeCassandraConnection(): Promise<void> {
  try {
    if (isCassandraConnected) {
      await cassandraClient.shutdown();
      isCassandraConnected = false;
      logger.db.info('Conexión a Apache Cassandra cerrada exitosamente.');
    }
  } catch (err) {
    logger.db.warn('Error al cerrar cliente Cassandra', err);
  }
}

