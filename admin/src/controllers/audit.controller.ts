import { AuthenticatedAdminRequest } from '../types/auth.types.js';
import { getAdminAuditLogDetail, getAdminAuditLogs } from '../services/audit.service.js';
import { logger } from '../services/logger.service.js';
import { Response } from 'express';

export async function getAuditLogsHandler(req: AuthenticatedAdminRequest, res: Response): Promise<void> {
  try {
    const page = req.query.page ? parseInt(String(req.query.page), 10) : 1;
    const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 30;
    const actorType = typeof req.query.actorType === 'string' ? req.query.actorType : undefined;
    const action = typeof req.query.action === 'string' ? req.query.action : undefined;
    const search = typeof req.query.search === 'string' ? req.query.search : undefined;

    const result = await getAdminAuditLogs({ action, actorType, limit, page, search });
    res.status(200).json({ ...result, success: true });
  } catch (error) {
    logger.app.error('Error en getAuditLogsHandler', error);
    res.status(500).json({ error: 'Ha ocurrido un error al obtener los registros de auditoría.' });
  }
}

export async function getAuditLogDetailHandler(req: AuthenticatedAdminRequest, res: Response): Promise<void> {
  const { uuid } = req.params;
  if (!uuid) {
    res.status(400).json({ error: 'Identificador de registro requerido.' });
    return;
  }

  try {
    const log = await getAdminAuditLogDetail(uuid);
    if (!log) {
      res.status(404).json({ error: 'Registro de auditoría no encontrado.' });
      return;
    }
    res.status(200).json({ log, success: true });
  } catch (error) {
    logger.app.error(`Error en getAuditLogDetailHandler para ${uuid}`, error);
    res.status(500).json({ error: 'Ha ocurrido un error al consultar el detalle de auditoría.' });
  }
}
