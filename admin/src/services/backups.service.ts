import { pool } from '../config/database.config.js';
import { logger } from './logger.service.js';
import { spawn } from 'child_process';
import fs from 'fs';
import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import path from 'path';

export interface BackupRecord {
  backup_name: string;
  backup_type: 'automated' | 'full' | 'selective';
  created_at: string;
  created_by_name: string;
  engines: string;
  error_message: string | null;
  execution_duration_ms: number;
  expires_at: string | null;
  id: number;
  is_pinned: number;
  metadata: any | null;
  retention_days: number;
  s3_archive_key: string | null;
  s3_bucket: string;
  s3_manifest_key: string | null;
  sha256_checksum: string | null;
  size_bytes: number;
  status: 'completed' | 'failed' | 'in_progress';
  total_redis_keys: number;
  total_rows: number;
  total_s3_objects: number;
  total_tables: number;
  uncompressed_size_bytes: number;
  updated_at: string;
  uuid: string;
}

export interface RestoreRecord {
  backup_uuid: string;
  created_at: string;
  error_message: string | null;
  execution_duration_ms: number;
  id: number;
  pre_restore_backup_uuid: string | null;
  restore_mode: 'merge' | 'replace';
  restore_report: any | null;
  restored_by_name: string;
  selected_components: any;
  selected_engines: string;
  status: 'completed' | 'failed' | 'in_progress' | 'pending';
  updated_at: string;
  uuid: string;
}

export interface CreateBackupInput {
  backup_name?: string;
  backup_type?: 'automated' | 'full' | 'selective';
  created_by_name?: string;
  engines?: string[];
  is_pinned?: boolean;
  retention_days?: number;
  selected_cassandra_tables?: string[];
  selected_mysql_tables?: string[];
  selected_s3_prefixes?: string[];
}

export interface RestoreBackupInput {
  backup_uuid: string;
  create_pre_restore_backup?: boolean;
  restore_mode?: 'merge' | 'replace';
  restored_by_name?: string;
  selected_components: {
    cassandra_tables?: string[];
    mysql_tables?: string[];
    redis?: boolean;
    s3_prefixes?: string[];
  };
}

let cachedPythonCmd: string | null = null;

async function detectPythonCommand(): Promise<string> {
  if (cachedPythonCmd) return cachedPythonCmd;
  const candidates = ['py', 'python3', 'python'];
  for (const cmd of candidates) {
    const isAvailable = await new Promise<boolean>((resolve) => {
      const proc = spawn(cmd, ['--version']);
      proc.on('error', () => resolve(false));
      proc.on('close', (code) => resolve(code === 0));
    });
    if (isAvailable) {
      cachedPythonCmd = cmd;
      return cmd;
    }
  }
  cachedPythonCmd = 'python';
  return 'python';
}

function getBackupEnginePaths(): { cwd: string; scriptPath: string } {
  const currentPath = path.resolve(process.cwd(), 'payment_worker', 'backup_engine.py');
  if (fs.existsSync(currentPath)) {
    return { cwd: process.cwd(), scriptPath: currentPath };
  }
  const parentPath = path.resolve(process.cwd(), '..', 'payment_worker', 'backup_engine.py');
  if (fs.existsSync(parentPath)) {
    return { cwd: path.resolve(process.cwd(), '..'), scriptPath: parentPath };
  }
  return { cwd: process.cwd(), scriptPath: currentPath };
}

export async function runBackupEngineCommand(args: string[]): Promise<any> {
  const pyCmd = await detectPythonCommand();
  const { cwd: projectCwd, scriptPath } = getBackupEnginePaths();

  return new Promise((resolve, reject) => {
    const proc = spawn(pyCmd, [scriptPath, ...args], {
      cwd: projectCwd,
      env: { ...process.env },
    });

    let stdoutData = '';
    let stderrData = '';

    proc.stdout.on('data', (chunk) => {
      stdoutData += chunk.toString();
    });

    proc.stderr.on('data', (chunk) => {
      stderrData += chunk.toString();
    });

    proc.on('error', (err) => {
      logger.app.error('Error al invocar motor de backups Python', { error: err.message, scriptPath });
      reject(err);
    });

    proc.on('close', (code) => {
      if (code !== 0) {
        logger.app.error('Motor de backups Python finalizó con código de error', { code, stderrData, stdoutData });
        reject(new Error(stderrData.trim() || `Motor de backup falló con código ${code}`));
        return;
      }

      try {
        const parsed = JSON.parse(stdoutData.trim());
        resolve(parsed);
      } catch (parseError) {
        logger.app.error('Respuesta no JSON del motor de backups Python', { stdoutData, stderrData });
        reject(new Error('Respuesta inválida del motor de backups'));
      }
    });
  });
}

export async function getBackupKpis() {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT
       COUNT(*) AS total_backups,
       SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed_backups,
       SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed_backups,
       SUM(CASE WHEN is_pinned = 1 THEN 1 ELSE 0 END) AS pinned_backups,
       COALESCE(SUM(CASE WHEN status = 'completed' THEN size_bytes ELSE 0 END), 0) AS total_size_bytes,
       COALESCE(SUM(CASE WHEN status = 'completed' THEN uncompressed_size_bytes ELSE 0 END), 0) AS total_uncompressed_bytes,
       COALESCE(SUM(CASE WHEN status = 'completed' THEN total_rows ELSE 0 END), 0) AS total_archived_rows,
       COALESCE(SUM(CASE WHEN status = 'completed' THEN total_s3_objects ELSE 0 END), 0) AS total_archived_s3_objects,
       MAX(CASE WHEN status = 'completed' THEN created_at ELSE NULL END) AS last_backup_at
     FROM system_backups`
  );

  const [restoreRows] = await pool.query<RowDataPacket[]>(
    `SELECT
       COUNT(*) AS total_restores,
       SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed_restores,
       MAX(CASE WHEN status = 'completed' THEN created_at ELSE NULL END) AS last_restore_at
     FROM system_backup_restores`
  );

  return {
    completed_backups: Number(rows[0]?.completed_backups || 0),
    completed_restores: Number(restoreRows[0]?.completed_restores || 0),
    failed_backups: Number(rows[0]?.failed_backups || 0),
    last_backup_at: rows[0]?.last_backup_at || null,
    last_restore_at: restoreRows[0]?.last_restore_at || null,
    pinned_backups: Number(rows[0]?.pinned_backups || 0),
    total_archived_rows: Number(rows[0]?.total_archived_rows || 0),
    total_archived_s3_objects: Number(rows[0]?.total_archived_s3_objects || 0),
    total_backups: Number(rows[0]?.total_backups || 0),
    total_restores: Number(restoreRows[0]?.total_restores || 0),
    total_size_bytes: Number(rows[0]?.total_size_bytes || 0),
    total_uncompressed_bytes: Number(rows[0]?.total_uncompressed_bytes || 0),
  };
}

export async function listBackups(params: {
  engine?: string;
  limit?: number;
  page?: number;
  search?: string;
  status?: string;
}) {
  const page = Math.max(1, params.page || 1);
  const limit = Math.min(100, Math.max(1, params.limit || 15));
  const offset = (page - 1) * limit;

  const conditions: string[] = [];
  const queryParams: any[] = [];

  if (params.status && params.status !== 'all') {
    conditions.push('status = ?');
    queryParams.push(params.status);
  }

  if (params.engine && params.engine !== 'all') {
    conditions.push('FIND_IN_SET(?, engines)');
    queryParams.push(params.engine);
  }

  if (params.search && params.search.trim()) {
    conditions.push('(backup_name LIKE ? OR uuid LIKE ? OR created_by_name LIKE ?)');
    const searchTerm = `%${params.search.trim()}%`;
    queryParams.push(searchTerm, searchTerm, searchTerm);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const [countRows] = await pool.query<RowDataPacket[]>(
    `SELECT COUNT(*) AS total FROM system_backups ${whereClause}`,
    queryParams
  );
  const total = Number(countRows[0]?.total || 0);

  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT * FROM system_backups ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    [...queryParams, limit, offset]
  );

  const items = rows.map((r) => {
    let meta = r.metadata;
    if (typeof meta === 'string') {
      try {
        meta = JSON.parse(meta);
      } catch {
        meta = null;
      }
    }
    return {
      ...r,
      metadata: meta,
    } as BackupRecord;
  });

  return {
    items,
    limit,
    page,
    total,
    totalPages: Math.ceil(total / limit) || 1,
  };
}

export async function getBackupDetails(uuid: string): Promise<(BackupRecord & { recent_restores: any[] }) | null> {
  const [rows] = await pool.query<RowDataPacket[]>(
    'SELECT * FROM system_backups WHERE uuid = ?',
    [uuid]
  );
  if (!rows || rows.length === 0) return null;

  const rec = rows[0] as unknown as BackupRecord;
  let meta = rec.metadata;
  if (typeof meta === 'string') {
    try {
      meta = JSON.parse(meta);
    } catch {
      meta = null;
    }
  }

  const [restores] = await pool.query<RowDataPacket[]>(
    'SELECT * FROM system_backup_restores WHERE backup_uuid = ? ORDER BY created_at DESC LIMIT 10',
    [uuid]
  );

  return {
    ...rec,
    metadata: meta,
    recent_restores: restores.map((r) => {
      let rep = r.restore_report;
      if (typeof rep === 'string') {
        try {
          rep = JSON.parse(rep);
        } catch {
          rep = null;
        }
      }
      return {
        ...r,
        restore_report: rep,
      };
    }),
  };
}

export async function triggerLiveInventory() {
  return runBackupEngineCommand(['--action', 'inspect_live']);
}

export async function createNewBackup(input: CreateBackupInput) {
  const args: string[] = ['--action', 'create'];

  if (input.backup_name) {
    args.push('--name', input.backup_name);
  }
  if (input.backup_type) {
    args.push('--type', input.backup_type);
  }
  if (input.engines && input.engines.length > 0) {
    args.push('--engines', input.engines.join(','));
  }
  if (input.selected_mysql_tables && input.selected_mysql_tables.length > 0) {
    args.push('--mysql-tables', input.selected_mysql_tables.join(','));
  }
  if (input.selected_cassandra_tables && input.selected_cassandra_tables.length > 0) {
    args.push('--cassandra-tables', input.selected_cassandra_tables.join(','));
  }
  if (input.selected_s3_prefixes && input.selected_s3_prefixes.length > 0) {
    args.push('--s3-prefixes', input.selected_s3_prefixes.join(','));
  }
  if (input.is_pinned) {
    args.push('--pinned');
  }
  if (input.retention_days && input.retention_days > 0) {
    args.push('--retention-days', String(input.retention_days));
  }
  if (input.created_by_name) {
    args.push('--created-by', input.created_by_name);
  }

  return runBackupEngineCommand(args);
}

export async function restoreBackupExecution(input: RestoreBackupInput) {
  const b64Components = Buffer.from(JSON.stringify(input.selected_components)).toString('base64');
  const args: string[] = [
    '--action', 'restore',
    '--backup-uuid', input.backup_uuid,
    '--restore-mode', input.restore_mode || 'merge',
    '--restore-components', b64Components,
    '--created-by', input.restored_by_name || 'Administrador',
  ];

  if (input.create_pre_restore_backup) {
    args.push('--pre-restore-backup');
  }

  return runBackupEngineCommand(args);
}

export async function verifyBackupIntegrity(uuid: string) {
  return runBackupEngineCommand(['--action', 'verify', '--backup-uuid', uuid]);
}

export async function syncCatalogFromS3() {
  return runBackupEngineCommand(['--action', 'sync_catalog']);
}

export async function removeBackup(uuid: string) {
  return runBackupEngineCommand(['--action', 'delete', '--backup-uuid', uuid]);
}

export async function togglePinStatus(uuid: string, isPinned: boolean) {
  const [res] = await pool.query<ResultSetHeader>(
    'UPDATE system_backups SET is_pinned = ? WHERE uuid = ?',
    [isPinned ? 1 : 0, uuid]
  );
  return res.affectedRows > 0;
}

export async function listRestores(params: {
  backupUuid?: string;
  limit?: number;
  page?: number;
}) {
  const page = Math.max(1, params.page || 1);
  const limit = Math.min(100, Math.max(1, params.limit || 15));
  const offset = (page - 1) * limit;

  const conditions: string[] = [];
  const queryParams: any[] = [];

  if (params.backupUuid) {
    conditions.push('backup_uuid = ?');
    queryParams.push(params.backupUuid);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const [countRows] = await pool.query<RowDataPacket[]>(
    `SELECT COUNT(*) AS total FROM system_backup_restores ${whereClause}`,
    queryParams
  );
  const total = Number(countRows[0]?.total || 0);

  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT * FROM system_backup_restores ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    [...queryParams, limit, offset]
  );

  const items = rows.map((r) => {
    let rep = r.restore_report;
    let comps = r.selected_components;
    if (typeof rep === 'string') {
      try {
        rep = JSON.parse(rep);
      } catch {
        rep = null;
      }
    }
    if (typeof comps === 'string') {
      try {
        comps = JSON.parse(comps);
      } catch {
        comps = null;
      }
    }
    return {
      ...r,
      restore_report: rep,
      selected_components: comps,
    } as RestoreRecord;
  });

  return {
    items,
    limit,
    page,
    total,
    totalPages: Math.ceil(total / limit) || 1,
  };
}

export async function getRestoreDetails(uuid: string) {
  const [rows] = await pool.query<RowDataPacket[]>(
    'SELECT * FROM system_backup_restores WHERE uuid = ?',
    [uuid]
  );
  if (!rows || rows.length === 0) return null;

  const r = rows[0];
  let rep = r.restore_report;
  let comps = r.selected_components;
  if (typeof rep === 'string') {
    try {
      rep = JSON.parse(rep);
    } catch {
      rep = null;
    }
  }
  if (typeof comps === 'string') {
    try {
      comps = JSON.parse(comps);
    } catch {
      comps = null;
    }
  }

  return {
    ...r,
    restore_report: rep,
    selected_components: comps,
  };
}

export async function getScheduleSettings() {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT setting_key, setting_value, description FROM system_settings
     WHERE setting_key IN (
       'backup_auto_enabled',
       'backup_schedule_frequency',
       'backup_schedule_time',
       'backup_default_retention_days',
       'backup_default_engines'
     )`
  );

  const settings: Record<string, string> = {
    backup_auto_enabled: '1',
    backup_default_engines: 'mysql,cassandra,s3,redis',
    backup_default_retention_days: '30',
    backup_schedule_frequency: 'daily',
    backup_schedule_time: '03:00',
  };

  for (const r of rows) {
    settings[r.setting_key] = String(r.setting_value);
  }

  return settings;
}

export async function updateScheduleSettings(settings: Record<string, string>) {
  const allowedKeys = [
    'backup_auto_enabled',
    'backup_schedule_frequency',
    'backup_schedule_time',
    'backup_default_retention_days',
    'backup_default_engines',
  ];

  for (const key of allowedKeys) {
    if (settings[key] !== undefined) {
      await pool.query(
        'INSERT INTO system_settings (setting_key, setting_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)',
        [key, String(settings[key])]
      );
    }
  }

  return getScheduleSettings();
}
