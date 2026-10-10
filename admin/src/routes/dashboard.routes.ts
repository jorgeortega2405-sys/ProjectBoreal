import { requirePermission } from '../middlewares/auth.middleware.js';
import { dashboardService } from '../services/dashboard.service.js';
import { logger } from '../services/logger.service.js';
import { Request, Response, Router } from 'express';

const router = Router();

router.get('/stats', requirePermission('dashboard:read'), async (req: Request, res: Response): Promise<void> => {
  try {
    const rawPeriod = typeof req.query.period === 'string' ? req.query.period : '30d';
    const allowedPeriods = ['7d', '30d', '90d', 'year'];
    const period = allowedPeriods.includes(rawPeriod) ? rawPeriod : '30d';

    const data = await dashboardService.getDashboardStats(period);
    res.status(200).json({
      data,
      success: true,
    });
  } catch (err) {
    logger.app.error('Error al procesar estadísticas de dashboard:', err);
    res.status(500).json({
      error: 'Ha ocurrido un error inesperado al procesar la solicitud. Por favor intenta más tarde.',
      success: false,
    });
  }
});

export default router;
