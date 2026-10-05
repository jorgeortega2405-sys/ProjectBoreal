import cassandra from 'cassandra-driver';
import { config } from './env.config.js';
import { logger } from '../services/logger.service.js';

const authProvider = config.cassandra.user
  ? new cassandra.auth.PlainTextAuthProvider(config.cassandra.user, config.cassandra.password)
  : undefined;

export const cassandraClient = new cassandra.Client({
  authProvider,
  contactPoints: config.cassandra.contactPoints,
  keyspace: config.cassandra.keyspace,
  localDataCenter: config.cassandra.localDataCenter,
  protocolOptions: {
    port: config.cassandra.port,
  },
});

export let isCassandraConnected = false;

export async function checkCassandraConnection(): Promise<boolean> {
  try {
    await cassandraClient.connect();
    isCassandraConnected = true;
    logger.db.info(`Conexión establecida exitosamente con Apache Cassandra para Admin (Keyspace: ${config.cassandra.keyspace}).`);
    return true;
  } catch (err) {
    isCassandraConnected = false;
    logger.db.warn(
      `Apache Cassandra no está disponible en ${config.cassandra.contactPoints.join(',')}:${config.cassandra.port} para Admin. Auditoría en modo degradado.`
    );
    return false;
  }
}
