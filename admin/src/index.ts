import { checkDbConnection, closeDbConnections } from './config/database.config.js';
import { config, isAllowedOrigin } from './config/env.config.js';
import { checkRedisConnection, closeRedisConnection } from './config/redis.config.js';
import { requestLogger } from './middlewares/request-logger.middleware.js';
import dashboardRoutes from './routes/dashboard.routes.js';
import giveawaysRoutes from './routes/giveaways.routes.js';
import healthRoutes from './routes/health.routes.js';
import ordersRoutes from './routes/orders.routes.js';
import { logger } from './services/logger.service.js';
import express, { NextFunction, Request, Response } from 'express';
import fs from 'fs';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ADMIN_ROOT_DIR = path.resolve(__dirname, '..');

process.on('uncaughtException', (err: Error) => {
  logger.app.error('Excepción no controlada capturada en proceso Node.js Admin', err);
});

process.on('unhandledRejection', (reason: unknown) => {
  logger.app.error('Promesa rechazada no controlada en proceso Node.js Admin', reason);
});

async function setupClient(app: express.Express, server: http.Server): Promise<void> {
  const adminRoot = ADMIN_ROOT_DIR;

  if (config.nodeEnv !== 'production') {
    const { createServer } = await import('vite');
    const vite = await createServer({
      appType: 'spa',
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
      if (url.startsWith('/api') || req.path.startsWith('/api')) {
        res.status(404).json({
          error: 'Endpoint de API no encontrado.',
          success: false,
        });
        return;
      }
      try {
        const template = fs.readFileSync(path.resolve(adminRoot, 'index.html'), 'utf-8');
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
    app.get('*', (req: Request, res: Response) => {
      const url = req.originalUrl;
      if (url.startsWith('/api') || req.path.startsWith('/api')) {
        res.status(404).json({
          error: 'Endpoint de API no encontrado.',
          success: false,
        });
        return;
      }
      res.sendFile(path.join(clientDist, 'index.html'));
    });
  }

  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    logger.app.error('Error no controlado en middleware o ruta Admin', err);
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
  app.set('etag', false);
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
    if (origin && typeof origin === 'string' && !isAllowedOrigin(origin)) {
      res.status(403).json({ error: 'Acceso denegado por verificación de origen (CSRF).' });
      return;
    }
    next();
  });

  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));
  app.use(requestLogger);

  app.use('/api', (_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    next();
  });

  app.use('/api/health', healthRoutes);
  app.use('/api/dashboard', dashboardRoutes);
  app.use('/api/giveaways', giveawaysRoutes);
  app.use('/api/orders', ordersRoutes);

  const adminPublicDir = path.resolve(ADMIN_ROOT_DIR, 'public');
  const rootPublicDir = path.resolve(ADMIN_ROOT_DIR, '..', 'public');

  app.use('/images', express.static(path.join(adminPublicDir, 'images')));
  app.use('/images', express.static(path.join(rootPublicDir, 'images')));
  app.use('/uploads', express.static(path.join(adminPublicDir, 'uploads')));
  app.use('/uploads', express.static(path.join(rootPublicDir, 'uploads')));

  app.use(
    express.static(adminPublicDir, {
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
  const app = createExpressApp();
  const PORT = config.port;

  const server = http.createServer(app);
  await setupClient(app, server);

  server.listen(PORT, '0.0.0.0', () => {
    logger.app.info(`Servidor Admin [PID ${process.pid}] escuchando en puerto ${PORT}`);
  });

  void checkDbConnection();
  void checkRedisConnection();

  const handleShutdown = async (signal: string) => {
    logger.app.info(`Servidor Admin [PID ${process.pid}] recibió ${signal}. Drenando conexiones...`);
    server.close(async () => {
      try {
        await Promise.allSettled([
          closeDbConnections(),
          closeRedisConnection(),
        ]);
        logger.app.info(`Servidor Admin [PID ${process.pid}] finalizado exitosamente.`);
        process.exit(0);
      } catch (err) {
        logger.app.error('Error al cerrar conexiones en shutdown de Admin', err);
        process.exit(1);
      }
    });

    setTimeout(() => {
      logger.app.error('Forzando apagado por timeout en shutdown de Admin.');
      process.exit(1);
    }, 10000).unref();
  };

  process.on('SIGTERM', () => void handleShutdown('SIGTERM'));
  process.on('SIGINT', () => void handleShutdown('SIGINT'));
}

void startServer();
