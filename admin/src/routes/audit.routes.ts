import { requireAuth, requirePermission } from '../middlewares/auth.middleware.js';
import { auditService } from '../services/audit.service.js';
import { logger } from '../services/logger.service.js';
import { Request, Response, Router } from 'express';

const router = Router();

router.use(requireAuth);

router.get('/', requirePermission('audit:read'), async (req: Request, res: Response): Promise<void> => {
  try {
    const month = typeof req.query.month === 'string' ? req.query.month : undefined;
    const action = typeof req.query.action === 'string' ? req.query.action : undefined;
    const actorType = typeof req.query.actorType === 'string' ? req.query.actorType : undefined;
    const search = typeof req.query.search === 'string' ? req.query.search : undefined;
    const limit = typeof req.query.limit === 'string' ? parseInt(req.query.limit, 10) : 50;

    const [timeline, kpis] = await Promise.all([
      auditService.getAuditTimeline({ action, actorType, limit, month, search }),
      auditService.getAuditKpis(month),
    ]);

    const availableMonths = auditService.getAvailableMonths();

    res.status(200).json({
      data: {
        availableMonths,
        events: timeline.events,
        isConnected: timeline.isConnected,
        kpis,
        month: timeline.month,
      },
      success: true,
    });
  } catch (error) {
    logger.app.error('Error al consultar bitácora de auditoría', error);
    res.status(500).json({
      error: 'Ha ocurrido un error inesperado al procesar la solicitud. Por favor intenta más tarde.',
      success: false,
    });
  }
});

router.get('/:uuid', requirePermission('audit:read'), async (req: Request, res: Response): Promise<void> => {
  try {
    const uuid = req.params.uuid;
    const event = await auditService.getEventByUuid(uuid);

    if (!event) {
      res.status(404).json({
        error: 'Evento de auditoría no encontrado en Apache Cassandra.',
        success: false,
      });
      return;
    }

    res.status(200).json({
      data: { event },
      success: true,
    });
  } catch (error) {
    logger.app.error('Error al consultar evento específico de auditoría', error);
    res.status(500).json({
      error: 'Ha ocurrido un error inesperado al procesar la solicitud. Por favor intenta más tarde.',
      success: false,
    });
  }
});

router.get('/order/:orderUuid', requirePermission('audit:read'), async (req: Request, res: Response): Promise<void> => {
  try {
    const orderUuid = req.params.orderUuid;
    const events = await auditService.getOrderAuditTrail(orderUuid);

    res.status(200).json({
      data: { events },
      success: true,
    });
  } catch (error) {
    logger.app.error('Error al consultar pista de auditoría de orden', error);
    res.status(500).json({
      error: 'Ha ocurrido un error inesperado al procesar la solicitud. Por favor intenta más tarde.',
      success: false,
    });
  }
});

export default router;
