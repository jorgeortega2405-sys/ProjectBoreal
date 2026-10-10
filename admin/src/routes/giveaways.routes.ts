import { requirePermission } from '../middlewares/auth.middleware.js';
import { createGiveaway, deleteDraftGiveaway, executeManualDraw, getActiveBankAccounts, getAllGiveaways, getDailyGiveawayPotPercentage, getGiveawayByUuid, isDailyGiveawayPauseScheduled, saveUploadedGiveawayImage, setDailyGiveawayPauseScheduled, setDailyGiveawayPotPercentage, updateGiveaway, updateGiveawayStatus } from '../services/giveaways.service.js';
import { logger } from '../services/logger.service.js';
import { getSafeErrorMessage } from '../utils/error.util.js';
import { Request, Response, Router } from 'express';

const router = Router();

router.get('/', requirePermission('giveaways:read', 'giveaways:create', 'giveaways:manage', 'giveaways:draw', 'orders:read'), async (req: Request, res: Response): Promise<void> => {
  try {
    const search = typeof req.query.search === 'string' ? req.query.search : undefined;
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const type = typeof req.query.type === 'string' ? req.query.type : undefined;

    const items = await getAllGiveaways({ search, status, type });
    res.status(200).json({
      data: items,
      success: true,
    });
  } catch (err) {
    logger.app.error('Error al listar sorteos en admin:', err);
    res.status(500).json({
      error: 'Ha ocurrido un error inesperado al procesar la solicitud. Por favor intenta más tarde.',
      success: false,
    });
  }
});

router.get('/config/daily', requirePermission('giveaways:read', 'giveaways:manage'), async (_req: Request, res: Response): Promise<void> => {
  try {
    const isPaused = await isDailyGiveawayPauseScheduled();
    const potPercentage = await getDailyGiveawayPotPercentage();
    res.status(200).json({
      data: { isPaused, potPercentage },
      success: true,
    });
  } catch (err) {
    logger.app.error('Error al consultar configuración de sorteo diario en admin:', err);
    res.status(500).json({
      error: 'Ha ocurrido un error inesperado al procesar la solicitud. Por favor intenta más tarde.',
      success: false,
    });
  }
});

router.post('/config/daily/pot-percentage', requirePermission('giveaways:manage'), async (req: Request, res: Response): Promise<void> => {
  try {
    const { potPercentage } = req.body;
    const num = Number(potPercentage);
    if (Number.isNaN(num) || num < 1 || num > 100) {
      res.status(400).json({
        error: 'El porcentaje debe ser un número entero entre 1 y 100.',
        success: false,
      });
      return;
    }
    await setDailyGiveawayPotPercentage(num);
    res.status(200).json({
      data: { potPercentage: num },
      message: `El porcentaje de la bolsa acumulada se actualizó a ${num}%.`,
      success: true,
    });
  } catch (err) {
    logger.app.error('Error al actualizar porcentaje de sorteo diario en admin:', err);
    res.status(500).json({
      error: 'Ha ocurrido un error inesperado al procesar la solicitud. Por favor intenta más tarde.',
      success: false,
    });
  }
});

router.post('/config/daily/schedule-pause', requirePermission('giveaways:manage'), async (req: Request, res: Response): Promise<void> => {
  try {
    const { pause } = req.body;
    const shouldPause = Boolean(pause);
    await setDailyGiveawayPauseScheduled(shouldPause);
    res.status(200).json({
      data: { isPaused: shouldPause },
      message: shouldPause
        ? 'Se ha programado la pausa para el siguiente ciclo del sorteo diario.'
        : 'Se ha reactivado la regeneración automática para el sorteo diario.',
      success: true,
    });
  } catch (err) {
    logger.app.error('Error al actualizar pausa programada de sorteo diario en admin:', err);
    res.status(500).json({
      error: 'Ha ocurrido un error inesperado al procesar la solicitud. Por favor intenta más tarde.',
      success: false,
    });
  }
});

router.get('/bank-accounts', requirePermission('giveaways:read', 'giveaways:create', 'giveaways:manage', 'bank_accounts:read'), async (_req: Request, res: Response): Promise<void> => {
  try {
    const accounts = await getActiveBankAccounts();
    res.status(200).json({
      data: accounts,
      success: true,
    });
  } catch (err) {
    logger.app.error('Error al listar cuentas bancarias en admin:', err);
    res.status(500).json({
      error: 'Ha ocurrido un error inesperado al procesar la solicitud. Por favor intenta más tarde.',
      success: false,
    });
  }
});

router.post('/upload', requirePermission('giveaways:create', 'giveaways:manage'), async (req: Request, res: Response): Promise<void> => {
  try {
    const { fileData, fileName } = req.body;
    if (!fileData) {
      res.status(400).json({
        error: 'No se recibieron datos de la imagen a subir.',
        success: false,
      });
      return;
    }
    const url = await saveUploadedGiveawayImage(fileData, fileName);
    res.status(200).json({
      data: { url },
      message: 'Imagen subida exitosamente.',
      success: true,
    });
  } catch (err: any) {
    logger.app.warn('Error al subir imagen de sorteo en admin:', err);
    res.status(400).json({
      error: getSafeErrorMessage(err, 'Error al procesar y almacenar la imagen.'),
      success: false,
    });
  }
});

router.get('/:uuid', requirePermission('giveaways:read', 'giveaways:create', 'giveaways:manage', 'giveaways:draw'), async (req: Request, res: Response): Promise<void> => {
  try {
    const { uuid } = req.params;
    const giveaway = await getGiveawayByUuid(uuid);
    if (!giveaway) {
      res.status(404).json({
        error: 'El sorteo solicitado no fue encontrado.',
        success: false,
      });
      return;
    }
    res.status(200).json({
      data: giveaway,
      success: true,
    });
  } catch (err) {
    logger.app.error('Error al obtener detalle de sorteo en admin:', err);
    res.status(500).json({
      error: 'Ha ocurrido un error inesperado al procesar la solicitud. Por favor intenta más tarde.',
      success: false,
    });
  }
});

router.post('/', requirePermission('giveaways:create'), async (req: Request, res: Response): Promise<void> => {
  try {
    const created = await createGiveaway(req.body);
    res.status(201).json({
      data: created,
      message: 'Sorteo creado exitosamente.',
      success: true,
    });
  } catch (err: any) {
    logger.app.warn('Validación o error al crear sorteo en admin:', err);
    res.status(400).json({
      error: getSafeErrorMessage(err, 'Error al validar los datos del sorteo.'),
      success: false,
    });
  }
});

router.put('/:uuid', requirePermission('giveaways:manage'), async (req: Request, res: Response): Promise<void> => {
  try {
    const { uuid } = req.params;
    const updated = await updateGiveaway(uuid, req.body);
    res.status(200).json({
      data: updated,
      message: 'Sorteo actualizado exitosamente.',
      success: true,
    });
  } catch (err: any) {
    logger.app.warn('Validación o error al actualizar sorteo en admin:', err);
    res.status(400).json({
      error: getSafeErrorMessage(err, 'Error al actualizar el sorteo.'),
      success: false,
    });
  }
});

router.patch('/:uuid/status', requirePermission('giveaways:manage'), async (req: Request, res: Response): Promise<void> => {
  try {
    const { uuid } = req.params;
    const { forceWithSales, status } = req.body;
    if (!status || !['active', 'paused', 'cancelled'].includes(status)) {
      res.status(400).json({
        error: 'Estado no válido. Los estados permitidos son active, paused o cancelled.',
        success: false,
      });
      return;
    }
    const updated = await updateGiveawayStatus(uuid, status, Boolean(forceWithSales));
    res.status(200).json({
      data: updated,
      message: `El estado del sorteo ha sido cambiado a ${status}.`,
      success: true,
    });
  } catch (err: any) {
    logger.app.warn('Validación o error al cambiar estado de sorteo en admin:', err);
    res.status(400).json({
      error: getSafeErrorMessage(err, 'Error al modificar el estado del sorteo.'),
      success: false,
    });
  }
});

router.post('/:uuid/draw', requirePermission('giveaways:draw'), async (req: Request, res: Response): Promise<void> => {
  try {
    const { uuid } = req.params;
    const completed = await executeManualDraw(uuid);
    res.status(200).json({
      data: completed,
      message: `El sorteo '${completed.title}' se ha ejecutado exitosamente. Ganador: ${completed.winner_name || 'Sin participantes'}, Boleto: #${completed.winner_ticket_number ?? 'N/A'}.`,
      success: true,
    });
  } catch (err: any) {
    logger.app.error('Error al ejecutar sorteo manual en admin:', err);
    res.status(400).json({
      error: getSafeErrorMessage(err, 'Error al ejecutar el sorteo.'),
      success: false,
    });
  }
});

router.delete('/:uuid', requirePermission('giveaways:delete'), async (req: Request, res: Response): Promise<void> => {
  try {
    const { uuid } = req.params;
    await deleteDraftGiveaway(uuid);
    res.status(200).json({
      message: 'Sorteo eliminado exitosamente.',
      success: true,
    });
  } catch (err: any) {
    logger.app.warn('Error al eliminar borrador de sorteo en admin:', err);
    res.status(400).json({
      error: getSafeErrorMessage(err, 'Error al eliminar el sorteo.'),
      success: false,
    });
  }
});

export default router;
