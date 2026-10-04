import { config } from './env.config.js';
import { logger } from '../services/logger.service.js';
import mysql from 'mysql2/promise';

export const pool = mysql.createPool({
  connectionLimit: config.db.connectionLimit,
  database: config.db.name,
  enableKeepAlive: true,
  host: config.db.host,
  keepAliveInitialDelay: 10000,
  password: config.db.password,
  port: config.db.port,
  queueLimit: config.db.queueLimit,
  user: config.db.user,
  waitForConnections: true,
});

export async function checkDbConnection(retries = 10, delayMs = 2000): Promise<void> {
  for (let i = 1; i <= retries; i++) {
    let conn: mysql.PoolConnection | null = null;
    try {
      conn = await pool.getConnection();
      await conn.ping();
      logger.db.info(`Conexión establecida exitosamente con MySQL (${config.db.name}).`);
      return;
    } catch (err) {
      logger.db.warn(`Esperando a MySQL en ${config.db.host}:${config.db.port} (intento ${i}/${retries})...`);
      if (i === retries) {
        logger.db.error('No se pudo conectar a la base de datos MySQL después de múltiples intentos.', err);
        throw err;
      }
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    } finally {
      if (conn) {
        conn.release();
      }
    }
  }
}
