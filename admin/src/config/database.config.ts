import mysql, { PoolConnection } from 'mysql2/promise';
import { config } from './env.config.js';
import { logger } from '../services/logger.service.js';

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

export const poolIdentity = mysql.createPool({
  charset: 'utf8mb4',
  connectionLimit: config.db.identity.connectionLimit,
  database: config.db.identity.name,
  enableKeepAlive: true,
  host: config.db.identity.host,
  keepAliveInitialDelay: 10000,
  password: config.db.identity.password,
  port: config.db.identity.port,
  queueLimit: config.db.identity.queueLimit,
  timezone: 'Z',
  user: config.db.identity.user,
  waitForConnections: true,
});

export const pool = poolLottery;

poolLottery.on('connection', (connection: any) => {
  connection.on('error', (err: any) => {
    logger.db.warn('Error en socket de conexión MySQL (Lottery Admin):', err);
  });
});

poolIdentity.on('connection', (connection: any) => {
  connection.on('error', (err: any) => {
    logger.db.warn('Error en socket de conexión MySQL (Identity Admin):', err);
  });
});

export async function checkDbConnection(retries = 10, delayMs = 2000): Promise<void> {
  const poolsToCheck = [
    { name: config.db.lottery.name, pool: poolLottery, type: 'Lottery' },
    { name: config.db.identity.name, pool: poolIdentity, type: 'Identity' },
  ];

  for (const item of poolsToCheck) {
    for (let i = 1; i <= retries; i++) {
      let conn: PoolConnection | null = null;
      try {
        conn = await item.pool.getConnection();
        await conn.ping();
        logger.db.info(`Conexión establecida exitosamente con MySQL ${item.type} (${item.name}) para Admin.`);
        break;
      } catch (err) {
        logger.db.warn(`Esperando a MySQL ${item.type} en ${item.name} para Admin (intento ${i}/${retries})...`);
        if (i === retries) {
          logger.db.error(`No se pudo conectar a la base de datos MySQL ${item.type} (${item.name}) para Admin.`, err);
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
}

export async function closeDbConnections(): Promise<void> {
  await Promise.allSettled([poolLottery.end(), poolIdentity.end()]);
  logger.db.info('Conexiones a MySQL cerradas exitosamente para Admin.');
}

