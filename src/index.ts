import { checkCassandraConnection, closeCassandraConnection } from './config/cassandra.config.js';
import { checkDbConnection, closeDbConnections } from './config/database.config.js';
import { config } from './config/env.config.js';
import { acquireDistributedLock, checkRedisConnection, closeRedisConnection, releaseDistributedLock } from './config/redis.config.js';
import { requestLogger } from './middlewares/request-logger.middleware.js';
import giveawaysRoutes from './routes/giveaways.routes.js';
import healthRoutes from './routes/health.routes.js';
import ordersRoutes from './routes/orders.routes.js';
import { processBanxicoBatch } from './services/banxico.service.js';
import { drawGiveawayWinners } from './services/giveaways.service.js';
import { logger } from './services/logger.service.js';
import { releaseExpiredReservations } from './services/orders.service.js';
import cluster from 'cluster';
import crypto from 'crypto';
import express, { NextFunction, Request, Response } from 'express';
import fs from 'fs';
import http from 'http';
import net from 'net';
import os from 'os';
import path from 'path';

function startScheduledTasks(): void {
  setInterval(async () => {
    const lockToken = crypto.randomUUID();
    const hasLock = await acquireDistributedLock('cron:release_expired', 55, lockToken);
    if (!hasLock) return;
    try {
      await releaseExpiredReservations();
    } finally {
      await releaseDistributedLock('cron:release_expired', lockToken);
    }
  }, 60 * 1000);

  setInterval(async () => {
    const lockToken = crypto.randomUUID();
    const hasLock = await acquireDistributedLock('cron:banxico_batch', 290, lockToken);
    if (!hasLock) return;
    try {
      await processBanxicoBatch();
    } finally {
      await releaseDistributedLock('cron:banxico_batch', lockToken);
    }
  }, 5 * 60 * 1000);

  setInterval(async () => {
    const lockToken = crypto.randomUUID();
    const hasLock = await acquireDistributedLock('cron:draw_winners', 14, lockToken);
    if (!hasLock) return;
    try {
      await drawGiveawayWinners();
    } finally {
      await releaseDistributedLock('cron:draw_winners', lockToken);
    }
  }, 15 * 1000);
}

async function setupClient(app: express.Express, server: http.Server): Promise<void> {
  if (config.nodeEnv !== 'production') {
    const { createServer } = await import('vite');
    const vite = await createServer({
      appType: 'spa',
      server: {
        middlewareMode: true,
        watch: {
          binaryInterval: 2000,
          ignored: [
            '**/node_modules/**',
            '**/dist/**',
            '**/logs/**',
            '**/.git/**',
            '**/public/**',
          ],
          interval: 2000,
          usePolling: true,
        },
        ws: { server },
      },
    });
    app.use(vite.middlewares);
    app.use('*', async (req: Request, res: Response, next: NextFunction) => {
      const url = req.originalUrl;
      try {
        const template = fs.readFileSync(path.resolve(process.cwd(), 'index.html'), 'utf-8');
        const html = await vite.transformIndexHtml(url, template);
        res.status(200).set({ 'Content-Type': 'text/html' }).end(html);
      } catch (e) {
        vite.ssrFixStacktrace(e as Error);
        next(e);
      }
    });
  } else {
    const clientDist = path.join(process.cwd(), 'dist/client');
    app.use(
      express.static(clientDist, {
        immutable: true,
        index: false,
        maxAge: '1y',
        setHeaders: (res, filePath) => {
          if (filePath.endsWith('.html')) {
            res.setHeader('Cache-Control', 'no-cache');
          }
        },
      })
    );
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(clientDist, 'index.html'));
    });
  }

  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    logger.app.error('Error no controlado en middleware o ruta', err);
    if (res.headersSent) {
      return next(err);
    }
    const statusCode = typeof err.status === 'number' ? err.status : 500;
    res.status(statusCode).json({
      error: 'Ha ocurrido un error inesperado al procesar la solicitud. Por favor intenta más tarde.',
    });
  });
}

function createExpressApp(): express.Express {
  const app = express();

  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    next();
  });

  app.use((req: Request, res: Response, next: NextFunction) => {
    const method = req.method.toUpperCase();
    if (['GET', 'HEAD', 'OPTIONS'].includes(method)) {
      return next();
    }
    const origin = (req.headers['origin'] || req.headers['referer']) as string | undefined;
    if (origin && typeof origin === 'string') {
      const isAllowed = origin.startsWith('http://localhost:')
        || origin.startsWith('https://localhost:')
        || origin.startsWith('http://127.0.0.1:')
        || origin.endsWith('.projectboreal.internal')
        || origin.includes('projectboreal.com');
      if (!isAllowed) {
        res.status(403).json({ error: 'Acceso denegado por verificación de origen (CSRF).' });
        return;
      }
    }
    next();
  });

  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));
  app.use(requestLogger);

  app.use('/api/giveaways', giveawaysRoutes);
  app.use('/api/health', healthRoutes);
  app.use('/api/orders', ordersRoutes);

  app.use(
    express.static(path.join(process.cwd(), 'public'), {
      index: false,
      maxAge: config.nodeEnv === 'production' ? '7d' : '1h',
      setHeaders: (res, filePath) => {
        if (filePath.endsWith('.html')) {
          res.setHeader('Cache-Control', 'no-cache');
        } else if (filePath.match(/\.(svg|png|jpg|jpeg|webp|gif|woff2|woff|ttf)$/)) {
          res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
        }
      },
    })
  );

  return app;
}

function configureWebSocketUpgrade(server: http.Server): void {
  server.on('upgrade', (req, clientSocket, head) => {
    const url = req.url || '';
    if (url === '/ws' || url.startsWith('/ws?') || url.startsWith('/ws/')) {
      const origin = req.headers.origin;
      if (origin && typeof origin === 'string') {
        const isAllowed = origin.startsWith('http://localhost:')
          || origin.startsWith('https://localhost:')
          || origin.startsWith('http://127.0.0.1:')
          || origin.endsWith('.projectboreal.internal')
          || origin.includes('projectboreal.com');
        if (!isAllowed) {
          clientSocket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
          clientSocket.destroy();
          return;
        }
      }

      clientSocket.pause();

      if (clientSocket instanceof net.Socket) {
        clientSocket.setNoDelay(true);
        clientSocket.setKeepAlive(true, 30000);
      }

      const proxySocket = net.connect(config.websocket.port, config.websocket.host, () => {
        proxySocket.setTimeout(0);
        proxySocket.setNoDelay(true);
        proxySocket.setKeepAlive(true, 30000);
        proxySocket.write(`${req.method} ${req.url} HTTP/${req.httpVersion}\r\n`);
        for (let i = 0; i < req.rawHeaders.length; i += 2) {
          proxySocket.write(`${req.rawHeaders[i]}: ${req.rawHeaders[i + 1]}\r\n`);
        }
        proxySocket.write('\r\n');
        if (head && head.length > 0) {
          proxySocket.write(head);
        }
        clientSocket.pipe(proxySocket);
        proxySocket.pipe(clientSocket);
        clientSocket.resume();
      });

      proxySocket.setTimeout(10000, () => {
        proxySocket.destroy();
      });

      clientSocket.on('error', (err) => {
        logger.app.debug('Error en socket cliente WebSocket', err);
        proxySocket.destroy();
      });

      proxySocket.on('error', (err) => {
        logger.app.warn('No se pudo conectar con el microservicio WebSocket en Rust', err);
        clientSocket.write('HTTP/1.1 502 Bad Gateway\r\n\r\n');
        clientSocket.destroy();
      });
    }
  });
}

async function startWorkerServer(): Promise<void> {
  const app = createExpressApp();
  const PORT = config.port;

  await checkDbConnection();
  await checkRedisConnection();
  await checkCassandraConnection();

  const server = http.createServer(app);
  await setupClient(app, server);
  configureWebSocketUpgrade(server);

  server.listen(PORT, '0.0.0.0', () => {
    logger.app.info(`Worker [PID ${process.pid}] escuchando en puerto ${PORT}`);
  });

  if (!config.cluster.enabled) {
    startScheduledTasks();
  }

  const handleShutdown = async (signal: string) => {
    logger.app.info(`Worker [PID ${process.pid}] recibió ${signal}. Drenando conexiones ordenadamente...`);
    server.close(async () => {
      try {
        await Promise.allSettled([
          closeDbConnections(),
          closeRedisConnection(),
          closeCassandraConnection(),
        ]);
        logger.app.info(`Worker [PID ${process.pid}] finalizado exitosamente.`);
        process.exit(0);
      } catch (err) {
        logger.app.error('Error al cerrar conexiones en shutdown del worker', err);
        process.exit(1);
      }
    });

    setTimeout(() => {
      logger.app.error('Forzando apagado por timeout en shutdown del worker.');
      process.exit(1);
    }, 10000).unref();
  };

  process.on('SIGTERM', () => void handleShutdown('SIGTERM'));
  process.on('SIGINT', () => void handleShutdown('SIGINT'));
}

async function startPrimaryCluster(): Promise<void> {
  const numWorkers = config.cluster.workers > 0
    ? config.cluster.workers
    : (os.availableParallelism ? os.availableParallelism() : os.cpus().length);

  logger.app.info(`Proceso maestro [PID ${process.pid}] iniciando cluster con ${numWorkers} workers.`);

  await checkRedisConnection();
  startScheduledTasks();

  for (let i = 0; i < numWorkers; i++) {
    cluster.fork();
  }

  cluster.on('exit', (worker, code, signal) => {
    logger.app.warn(`Worker [PID ${worker.process.pid}] finalizó (code: ${code}, signal: ${signal}). Reiniciando worker...`);
    cluster.fork();
  });

  const handleShutdown = async (signal: string) => {
    logger.app.info(`Proceso maestro recibió ${signal}. Deteniendo cluster...`);
    for (const id in cluster.workers) {
      cluster.workers[id]?.kill();
    }
    await closeRedisConnection();
    process.exit(0);
  };

  process.on('SIGTERM', () => void handleShutdown('SIGTERM'));
  process.on('SIGINT', () => void handleShutdown('SIGINT'));
}

async function bootstrap(): Promise<void> {
  try {
    if (config.cluster.enabled && cluster.isPrimary) {
      await startPrimaryCluster();
    } else {
      await startWorkerServer();
    }
  } catch (error) {
    logger.app.error('Fallo crítico al iniciar el servidor', error);
    process.exit(1);
  }
}

void bootstrap();
