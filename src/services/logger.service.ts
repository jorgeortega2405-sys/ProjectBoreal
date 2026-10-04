import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const LOGS_ROOT_DIR = path.resolve(__dirname, '../../logs');

export type LogLevel = 'INFO' | 'WARN' | 'ERROR' | 'DEBUG';
export type LogCategory = 'app' | 'database' | 'security';

const SENSITIVE_KEYS = new Set([
  'access_token',
  'api_key',
  'apikey',
  'authorization',
  'card_number',
  'cookie',
  'csrf',
  'csrftoken',
  'cvv',
  'password',
  'password_hash',
  'passwordhash',
  'private_key',
  'refresh_token',
  'secret',
  'secret_key',
  'session',
  'smtp_pass',
  'token',
]);

function sanitize(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj;

  if (typeof obj === 'string') {
    return obj;
  }

  if (obj instanceof Error) {
    return {
      message: obj.message,
      name: obj.name,
      stack: obj.stack,
    };
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => sanitize(item));
  }

  if (typeof obj === 'object') {
    const sanitized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      const lowerKey = key.toLowerCase();
      if (SENSITIVE_KEYS.has(lowerKey)) {
        sanitized[key] = '[REDACTED]';
      } else if (typeof value === 'object' && value !== null) {
        sanitized[key] = sanitize(value);
      } else {
        sanitized[key] = value;
      }
    }
    return sanitized;
  }

  return obj;
}

class CategoryLogger {
  private category: LogCategory;
  private categoryDir: string;
  private dirEnsured = false;

  constructor(category: LogCategory) {
    this.category = category;
    this.categoryDir = path.join(LOGS_ROOT_DIR, category);
  }

  private async ensureDirectory(): Promise<void> {
    if (this.dirEnsured) return;
    try {
      await fs.promises.mkdir(this.categoryDir, { recursive: true });
      this.dirEnsured = true;
    } catch {}
  }

  private getLogFilePath(): string {
    const today = new Date().toISOString().split('T')[0];
    return path.join(this.categoryDir, `${today}.log`);
  }

  private async writeLog(level: LogLevel, message: string, meta?: unknown, errorObj?: unknown): Promise<void> {
    try {
      await this.ensureDirectory();

      const timestamp = new Date().toISOString();
      let logLine = `[${timestamp}] [${level}] [${this.category.toUpperCase()}] ${message}`;

      if (errorObj) {
        const sanitizedErr = sanitize(errorObj);
        if (sanitizedErr instanceof Error || (typeof sanitizedErr === 'object' && sanitizedErr !== null && 'message' in sanitizedErr)) {
          const errObj = sanitizedErr as { message?: string; stack?: string };
          logLine += ` | Error: ${errObj.message || ''}`;
          if (errObj.stack) {
            logLine += `\nStack: ${errObj.stack}`;
          }
        } else {
          logLine += ` | Error: ${JSON.stringify(sanitizedErr)}`;
        }
      }

      if (meta !== undefined) {
        const sanitizedMeta = sanitize(meta);
        logLine += ` | Meta: ${JSON.stringify(sanitizedMeta)}`;
      }

      logLine += '\n';

      const filePath = this.getLogFilePath();
      await fs.promises.appendFile(filePath, logLine, 'utf8');
    } catch {}
  }

  info(message: string, meta?: unknown): void {
    void this.writeLog('INFO', message, meta);
  }

  warn(message: string, meta?: unknown): void {
    if (meta instanceof Error) {
      void this.writeLog('WARN', message, undefined, meta);
    } else {
      void this.writeLog('WARN', message, meta);
    }
  }

  error(message: string, error?: unknown, meta?: unknown): void {
    void this.writeLog('ERROR', message, meta, error);
  }

  debug(message: string, meta?: unknown): void {
    void this.writeLog('DEBUG', message, meta);
  }
}

export const logger = {
  app: new CategoryLogger('app'),
  database: new CategoryLogger('database'),
  db: new CategoryLogger('database'),
  security: new CategoryLogger('security'),
};

export default logger;
