import { getAllWinners, getWinnerDetail, getWinnersKpis, updateWinnerDelivery } from '../services/winners.service.js';
import { logger } from '../services/logger.service.js';
import { getSafeErrorMessage } from '../utils/error.util.js';
import { Request, Response, Router } from 'express';

const router = Router();

router.get('/kpis', async (_req: Request, res: Response): Promise<void> => {
  try {
    const kpis = await getWinnersKpis();
    res.status(200).json({
      data: kpis,
      success: true,
    });
  } catch (err) {
    logger.app.error('Error al obtener KPIs de ganadores en admin:', err);
    res.status(500).json({
      error: 'Ha ocurrido un error inesperado al procesar la solicitud. Por favor intenta más tarde.',
      success: false,
    });
  }
});

router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const search = typeof req.query.search === 'string' ? req.query.search : undefined;
    const deliveryStatus = typeof req.query.deliveryStatus === 'string' ? req.query.deliveryStatus : undefined;

    const winners = await getAllWinners({ deliveryStatus, search });
    res.status(200).json({
      data: winners,
      success: true,
    });
  } catch (err) {
    logger.app.error('Error al listar ganadores en admin:', err);
    res.status(500).json({
      error: 'Ha ocurrido un error inesperado al procesar la solicitud. Por favor intenta más tarde.',
      success: false,
    });
  }
});

router.get('/:uuid', async (req: Request, res: Response): Promise<void> => {
  try {
    const { uuid } = req.params;
    const data = await getWinnerDetail(uuid);
    if (!data) {
      res.status(404).json({
        error: 'El ganador del sorteo solicitado no fue encontrado.',
        success: false,
      });
      return;
    }
    res.status(200).json({
      data,
      success: true,
    });
  } catch (err) {
    logger.app.error('Error al obtener detalle del ganador en admin:', err);
    res.status(500).json({
      error: 'Ha ocurrido un error inesperado al procesar la solicitud. Por favor intenta más tarde.',
      success: false,
    });
  }
});

router.put('/:uuid/delivery', async (req: Request, res: Response): Promise<void> => {
  try {
    const { uuid } = req.params;
    const updated = await updateWinnerDelivery(uuid, req.body);
    res.status(200).json({
      data: updated,
      message: 'Estado de entrega y notas de ganador actualizados exitosamente.',
      success: true,
    });
  } catch (err: any) {
    logger.app.warn('Error al actualizar entrega de ganador en admin:', err);
    res.status(400).json({
      error: getSafeErrorMessage(err, 'Error al actualizar el estado de entrega del premio.'),
      success: false,
    });
  }
});

export default router;
