import apiRoutes from './routes/api.routes.js';
import { checkCassandraConnection, closeCassandraConnection } from './config/cassandra.config.js';
import { checkDbConnection, closeDbConnections } from './config/database.config.js';
import { checkRedisConnection, closeRedisConnection } from './config/redis.config.js';
import { config } from './config/env.config.js';
import cookieParser from 'cookie-parser';
import express, { NextFunction, Request, Response } from 'express';
import fs from 'fs';
import http from 'http';
import { logger } from './services/logger.service.js';
import path from 'path';

async function setupClient(app: express.Express, server: http.Server): Promise<void> {
  const adminRoot = path.resolve(import.meta.dirname, '..');

  if (config.nodeEnv !== 'production') {
    const { createServer } = await import('vite');
    const vite = await createServer({
      appType: 'spa',
      configFile: path.resolve(adminRoot, 'vite.config.ts'),
      root: adminRoot,
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
        const indexPath = path.resolve(adminRoot, 'index.html');
        const template = fs.readFileSync(indexPath, 'utf-8');
        const html = await vite.transformIndexHtml(url, template);
        res.status(200).set({ 'Content-Type': 'text/html' }).end(html);
      } catch (e) {
        vite.ssrFixStacktrace(e as Error);
        next(e);
      }
    });
  } else {
    const clientDist = path.join(adminRoot, 'dist/client');
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
    logger.app.error('Error no controlado en middleware o ruta de Admin', err);
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
  app.use(cookieParser());

  app.use('/api', apiRoutes);

  const adminRoot = path.resolve(import.meta.dirname, '..');

  app.use(
    express.static(path.join(adminRoot, 'public'), {
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

async function startServer(): Promise<void> {
  try {
    await checkDbConnection();
    await checkRedisConnection();
    await checkCassandraConnection();

    const app = createExpressApp();
    const server = http.createServer(app);

    await setupClient(app, server);

    const PORT = config.port;
    server.listen(PORT, () => {
      logger.app.info(`Servidor Administrativo iniciado exitosamente en http://localhost:${PORT}`);
    });

    const handleShutdown = (signal: string) => {
      logger.app.info(`Recibida señal ${signal}. Drenando conexiones del servidor administrativo...`);
      server.close(async () => {
        try {
          await Promise.allSettled([
            closeDbConnections(),
            closeRedisConnection(),
            closeCassandraConnection(),
          ]);
          logger.app.info('Servidor administrativo cerrado limpiamente.');
          process.exit(0);
        } catch (err) {
          logger.app.error('Error al cerrar recursos en shutdown de admin', err);
          process.exit(1);
        }
      });

      setTimeout(() => {
        logger.app.error('Forzando cierre de admin por timeout de shutdown.');
        process.exit(1);
      }, 10000).unref();
    };

    process.on('SIGTERM', () => handleShutdown('SIGTERM'));
    process.on('SIGINT', () => handleShutdown('SIGINT'));
  } catch (error) {
    logger.app.error('Fallo crítico al iniciar el servidor administrativo', error);
    process.exit(1);
  }
}

void startServer();
