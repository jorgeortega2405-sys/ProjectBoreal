import { AuthenticatedAdminRequest } from '../types/auth.types.js';
import { getDashboardStats } from '../services/dashboard.service.js';
import { logger } from '../services/logger.service.js';
import { Response } from 'express';

export async function getDashboardStatsHandler(_req: AuthenticatedAdminRequest, res: Response): Promise<void> {
  try {
    const stats = await getDashboardStats();
    res.status(200).json(stats);
  } catch (error) {
    logger.app.error('Error en getDashboardStatsHandler', error);
    res.status(500).json({ error: 'Ha ocurrido un error al obtener las estadísticas del dashboard.' });
  }
}
