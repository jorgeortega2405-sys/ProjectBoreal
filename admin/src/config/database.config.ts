import { logger } from '../services/logger.service.js';
import { config } from './env.config.js';
import mysql, { PoolConnection } from 'mysql2/promise';

export const pool = mysql.createPool({
  charset: 'utf8mb4',
  connectionLimit: config.db.connectionLimit,
  database: config.db.name,
  enableKeepAlive: true,
  host: config.db.host,
  keepAliveInitialDelay: 10000,
  password: config.db.password,
  port: config.db.port,
  queueLimit: config.db.queueLimit,
  timezone: 'Z',
  user: config.db.user,
  waitForConnections: true,
});

pool.on('connection', (connection: any) => {
  connection.on('error', (err: any) => {
    logger.db.warn('Error en socket de conexión MySQL Admin:', err);
  });
});

export async function checkDbConnection(retries = 5, delayMs = 2000): Promise<void> {
  for (let i = 1; i <= retries; i++) {
    let conn: PoolConnection | null = null;
    try {
      conn = await pool.getConnection();
      await conn.ping();
      logger.db.info(`Conexión establecida exitosamente con MySQL Admin (${config.db.name}).`);
      break;
    } catch (err) {
      logger.db.warn(`Esperando a MySQL Admin en ${config.db.name} (intento ${i}/${retries})...`);
      if (i === retries) {
        logger.db.warn(`MySQL no disponible actualmente en admin (${config.db.name}). Continuando en modo desacoplado.`);
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    } finally {
      if (conn) {
        conn.release();
      }
    }
  }
}

export async function closeDbConnections(): Promise<void> {
  await pool.end();
  logger.db.info('Conexiones a MySQL Admin cerradas exitosamente.');
}
