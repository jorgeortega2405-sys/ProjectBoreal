import { requirePermission } from '../middlewares/auth.middleware.js';
import { createNewBackup, getBackupDetails, getBackupKpis, getRestoreDetails, getScheduleSettings, listBackups, listRestores, removeBackup, restoreBackupExecution, syncCatalogFromS3, togglePinStatus, triggerLiveInventory, updateScheduleSettings, verifyBackupIntegrity } from '../services/backups.service.js';
import { logger } from '../services/logger.service.js';
import { getS3Object } from '../services/s3.service.js';
import { Request, Response, Router } from 'express';

const router = Router();

router.get(
  '/kpis',
  requirePermission('backups:read', 'backups:create', 'backups:manage'),
  async (_req: Request, res: Response): Promise<void> => {
    try {
      const kpis = await getBackupKpis();
      res.status(200).json({
        data: kpis,
        success: true,
      });
    } catch (err) {
      logger.app.error('Error al obtener KPIs de copias de seguridad en admin', { error: (err as Error).message });
      res.status(500).json({
        error: 'Ha ocurrido un error inesperado al procesar la solicitud. Por favor intenta más tarde.',
        success: false,
      });
    }
  }
);

router.get(
  '/catalog',
  requirePermission('backups:read', 'backups:create', 'backups:manage'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const page = req.query.page ? parseInt(String(req.query.page), 10) : 1;
      const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 15;
      const status = typeof req.query.status === 'string' ? req.query.status : undefined;
      const engine = typeof req.query.engine === 'string' ? req.query.engine : undefined;
      const search = typeof req.query.search === 'string' ? req.query.search : undefined;

      const result = await listBackups({
        engine,
        limit,
        page,
        search,
        status,
      });

      res.status(200).json({
        data: result,
        success: true,
      });
    } catch (err) {
      logger.app.error('Error al listar catálogo de copias de seguridad en admin', { error: (err as Error).message });
      res.status(500).json({
        error: 'Ha ocurrido un error inesperado al procesar la solicitud. Por favor intenta más tarde.',
        success: false,
      });
    }
  }
);

router.get(
  '/catalog/:uuid',
  requirePermission('backups:read', 'backups:create', 'backups:manage'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { uuid } = req.params;
      const details = await getBackupDetails(uuid);
      if (!details) {
        res.status(404).json({
          error: 'Copia de seguridad no encontrada.',
          success: false,
        });
        return;
      }

      res.status(200).json({
        data: details,
        success: true,
      });
    } catch (err) {
      logger.app.error('Error al obtener detalles de copia de seguridad', { error: (err as Error).message });
      res.status(500).json({
        error: 'Ha ocurrido un error inesperado al procesar la solicitud. Por favor intenta más tarde.',
        success: false,
      });
    }
  }
);

router.get(
  '/inventory',
  requirePermission('backups:read', 'backups:create', 'backups:manage'),
  async (_req: Request, res: Response): Promise<void> => {
    try {
      const inventory = await triggerLiveInventory();
      res.status(200).json({
        data: inventory,
        success: true,
      });
    } catch (err) {
      logger.app.error('Error al inspeccionar inventario en vivo de bases de datos y S3', { error: (err as Error).message });
      res.status(500).json({
        error: 'Ha ocurrido un error inesperado al procesar la solicitud. Por favor intenta más tarde.',
        success: false,
      });
    }
  }
);

router.post(
  '/create',
  requirePermission('backups:create', 'backups:manage'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { backup_name, backup_type, engines, is_pinned, retention_days, selected_cassandra_tables, selected_mysql_tables, selected_s3_prefixes } = req.body || {};
      const adminUser = (req as any).adminUser;
      const createdByName = adminUser?.name || 'Administrador';

      const result = await createNewBackup({
        backup_name,
        backup_type,
        created_by_name: createdByName,
        engines,
        is_pinned: Boolean(is_pinned),
        retention_days: retention_days ? parseInt(String(retention_days), 10) : 30,
        selected_cassandra_tables,
        selected_mysql_tables,
        selected_s3_prefixes,
      });

      if (!result.success) {
        res.status(400).json({
          error: result.error || 'No se pudo generar la copia de seguridad.',
          success: false,
        });
        return;
      }

      res.status(201).json({
        data: result,
        success: true,
      });
    } catch (err) {
      logger.app.error('Error al generar copia de seguridad en admin', { error: (err as Error).message });
      res.status(500).json({
        error: 'Ha ocurrido un error inesperado al procesar la solicitud. Por favor intenta más tarde.',
        success: false,
      });
    }
  }
);

router.post(
  '/restore',
  requirePermission('backups:restore', 'backups:manage'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { backup_uuid, create_pre_restore_backup, restore_mode, selected_components } = req.body || {};
      if (!backup_uuid) {
        res.status(400).json({
          error: 'El identificador de la copia de seguridad es requerido.',
          success: false,
        });
        return;
      }

      const adminUser = (req as any).adminUser;
      const restoredByName = adminUser?.name || 'Administrador';

      const result = await restoreBackupExecution({
        backup_uuid,
        create_pre_restore_backup: Boolean(create_pre_restore_backup),
        restore_mode: restore_mode === 'replace' ? 'replace' : 'merge',
        restored_by_name: restoredByName,
        selected_components: selected_components || {},
      });

      if (!result.success) {
        res.status(400).json({
          error: result.error || 'Error durante la ejecución de la restauración.',
          success: false,
        });
        return;
      }

      res.status(200).json({
        data: result,
        success: true,
      });
    } catch (err) {
      logger.app.error('Error al restaurar copia de seguridad en admin', { error: (err as Error).message });
      res.status(500).json({
        error: 'Ha ocurrido un error inesperado al procesar la solicitud. Por favor intenta más tarde.',
        success: false,
      });
    }
  }
);

router.post(
  '/verify/:uuid',
  requirePermission('backups:read', 'backups:manage'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { uuid } = req.params;
      const result = await verifyBackupIntegrity(uuid);
      res.status(200).json({
        data: result,
        success: true,
      });
    } catch (err) {
      logger.app.error('Error al verificar integridad de la copia de seguridad', { error: (err as Error).message });
      res.status(500).json({
        error: 'Ha ocurrido un error inesperado al procesar la solicitud. Por favor intenta más tarde.',
        success: false,
      });
    }
  }
);

router.post(
  '/sync',
  requirePermission('backups:manage'),
  async (_req: Request, res: Response): Promise<void> => {
    try {
      const result = await syncCatalogFromS3();
      res.status(200).json({
        data: result,
        success: true,
      });
    } catch (err) {
      logger.app.error('Error al sincronizar catálogo con S3 MinIO', { error: (err as Error).message });
      res.status(500).json({
        error: 'Ha ocurrido un error inesperado al procesar la solicitud. Por favor intenta más tarde.',
        success: false,
      });
    }
  }
);

router.post(
  '/pin/:uuid',
  requirePermission('backups:manage'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { uuid } = req.params;
      const { is_pinned } = req.body || {};
      const updated = await togglePinStatus(uuid, Boolean(is_pinned));
      res.status(200).json({
        data: { is_pinned: Boolean(is_pinned), updated },
        success: true,
      });
    } catch (err) {
      logger.app.error('Error al modificar fijación de copia de seguridad', { error: (err as Error).message });
      res.status(500).json({
        error: 'Ha ocurrido un error inesperado al procesar la solicitud. Por favor intenta más tarde.',
        success: false,
      });
    }
  }
);

router.patch(
  '/pin/:uuid',
  requirePermission('backups:manage'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { uuid } = req.params;
      const { is_pinned } = req.body || {};
      const updated = await togglePinStatus(uuid, Boolean(is_pinned));
      res.status(200).json({
        data: { is_pinned: Boolean(is_pinned), updated },
        success: true,
      });
    } catch (err) {
      logger.app.error('Error al modificar fijación de copia de seguridad', { error: (err as Error).message });
      res.status(500).json({
        error: 'Ha ocurrido un error inesperado al procesar la solicitud. Por favor intenta más tarde.',
        success: false,
      });
    }
  }
);

router.delete(
  '/:uuid',
  requirePermission('backups:delete'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { uuid } = req.params;
      const result = await removeBackup(uuid);
      if (!result.success) {
        res.status(400).json({
          error: result.error || 'No se pudo eliminar la copia de seguridad.',
          success: false,
        });
        return;
      }

      res.status(200).json({
        data: result,
        success: true,
      });
    } catch (err) {
      logger.app.error('Error al eliminar copia de seguridad en admin', { error: (err as Error).message });
      res.status(500).json({
        error: 'Ha ocurrido un error inesperado al procesar la solicitud. Por favor intenta más tarde.',
        success: false,
      });
    }
  }
);

router.get(
  '/restores',
  requirePermission('backups:read', 'backups:create', 'backups:manage'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const page = req.query.page ? parseInt(String(req.query.page), 10) : 1;
      const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 15;
      const backupUuid = typeof req.query.backup_uuid === 'string' ? req.query.backup_uuid : undefined;

      const result = await listRestores({
        backupUuid,
        limit,
        page,
      });

      res.status(200).json({
        data: result,
        success: true,
      });
    } catch (err) {
      logger.app.error('Error al listar historial de restauraciones en admin', { error: (err as Error).message });
      res.status(500).json({
        error: 'Ha ocurrido un error inesperado al procesar la solicitud. Por favor intenta más tarde.',
        success: false,
      });
    }
  }
);

router.get(
  '/restores/:uuid',
  requirePermission('backups:read', 'backups:create', 'backups:manage'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { uuid } = req.params;
      const details = await getRestoreDetails(uuid);
      if (!details) {
        res.status(404).json({
          error: 'Restauración no encontrada.',
          success: false,
        });
        return;
      }

      res.status(200).json({
        data: details,
        success: true,
      });
    } catch (err) {
      logger.app.error('Error al consultar detalles de restauración', { error: (err as Error).message });
      res.status(500).json({
        error: 'Ha ocurrido un error inesperado al procesar la solicitud. Por favor intenta más tarde.',
        success: false,
      });
    }
  }
);

router.get(
  '/schedule',
  requirePermission('backups:read', 'backups:manage'),
  async (_req: Request, res: Response): Promise<void> => {
    try {
      const settings = await getScheduleSettings();
      res.status(200).json({
        data: settings,
        success: true,
      });
    } catch (err) {
      logger.app.error('Error al consultar configuración de programación de copias de seguridad', { error: (err as Error).message });
      res.status(500).json({
        error: 'Ha ocurrido un error inesperado al procesar la solicitud. Por favor intenta más tarde.',
        success: false,
      });
    }
  }
);

router.put(
  '/schedule',
  requirePermission('backups:manage'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const updated = await updateScheduleSettings(req.body || {});
      res.status(200).json({
        data: updated,
        success: true,
      });
    } catch (err) {
      logger.app.error('Error al actualizar configuración de programación de copias de seguridad', { error: (err as Error).message });
      res.status(500).json({
        error: 'Ha ocurrido un error inesperado al procesar la solicitud. Por favor intenta más tarde.',
        success: false,
      });
    }
  }
);

router.get(
  '/download/:uuid',
  requirePermission('backups:read', 'backups:manage'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { uuid } = req.params;
      const details = await getBackupDetails(uuid);
      if (!details || !details.s3_archive_key) {
        res.status(404).json({
          error: 'Archivo de respaldo no encontrado en S3.',
          success: false,
        });
        return;
      }

      const s3Obj = await getS3Object(details.s3_archive_key);
      if (!s3Obj) {
        res.status(404).json({
          error: 'No se pudo recuperar el archivo de respaldo desde S3.',
          success: false,
        });
        return;
      }

      const filename = `boreal_backup_${details.uuid.substring(0, 8)}.tar.gz`;
      res.setHeader('Content-Type', 'application/gzip');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Content-Length', s3Obj.body.length);
      res.status(200).send(s3Obj.body);
    } catch (err) {
      logger.app.error('Error al descargar archivo de respaldo desde S3', { error: (err as Error).message });
      res.status(500).json({
        error: 'Ha ocurrido un error inesperado al procesar la solicitud. Por favor intenta más tarde.',
        success: false,
      });
    }
  }
);

export default router;
