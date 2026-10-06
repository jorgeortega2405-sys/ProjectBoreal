import { logger } from '../services/logger.service.js';
import { config } from './env.config.js';
import mysql, { PoolConnection } from 'mysql2/promise';

export const poolLottery = mysql.createPool({
  charset: 'utf8mb4',
  connectionLimit: config.db.lottery.connectionLimit,
  database: config.db.lottery.name,
  enableKeepAlive: true,
  host: config.db.lottery.host,
  keepAliveInitialDelay: 10000,
  password: config.db.lottery.password,
  port: config.db.lottery.port,
  queueLimit: config.db.lottery.queueLimit,
  timezone: 'Z',
  user: config.db.lottery.user,
  waitForConnections: true,
});

export const pool = poolLottery;

poolLottery.on('connection', (connection: any) => {
  connection.on('error', (err: any) => {
    logger.db.warn('Error en socket de conexión MySQL (Lottery):', err);
  });
});

export async function checkDbConnection(retries = 10, delayMs = 2000): Promise<void> {
  for (let i = 1; i <= retries; i++) {
    let conn: PoolConnection | null = null;
    try {
      conn = await poolLottery.getConnection();
      await conn.ping();
      logger.db.info(`Conexión establecida exitosamente con MySQL Lottery (${config.db.lottery.name}).`);
      break;
    } catch (err) {
      logger.db.warn(`Esperando a MySQL Lottery en ${config.db.lottery.name} (intento ${i}/${retries})...`);
      if (i === retries) {
        logger.db.error(`No se pudo conectar a la base de datos MySQL Lottery (${config.db.lottery.name}).`, err);
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

export async function closeDbConnections(): Promise<void> {
  await poolLottery.end();
  logger.db.info('Conexiones a MySQL cerradas exitosamente.');
}

