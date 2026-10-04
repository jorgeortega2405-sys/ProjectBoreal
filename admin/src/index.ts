import apiRoutes from './routes/api.routes.js';
import { checkDbConnection } from './config/database.config.js';
import { checkRedisConnection } from './config/redis.config.js';
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

    const app = createExpressApp();
    const server = http.createServer(app);

    await setupClient(app, server);

    const PORT = config.port;
    server.listen(PORT, () => {
      logger.app.info(`Servidor Administrativo iniciado exitosamente en http://localhost:${PORT}`);
    });

    const handleShutdown = (signal: string) => {
      logger.app.info(`Recibida señal ${signal}. Cerrando servidor administrativo...`);
      server.close(() => {
        logger.app.info('Servidor administrativo cerrado correctamente.');
        process.exit(0);
      });
    };

    process.on('SIGTERM', () => handleShutdown('SIGTERM'));
    process.on('SIGINT', () => handleShutdown('SIGINT'));
  } catch (error) {
    logger.app.error('Fallo crítico al iniciar el servidor administrativo', error);
    process.exit(1);
  }
}

void startServer();
