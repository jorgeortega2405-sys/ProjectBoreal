import { getCurrentDailyGiveaway, getRecentDailyWinners } from '../services/daily-giveaway.service.js';
import { getActiveGiveaways, getCompletedGiveawaysWithWinners, getGiveawayByUuid, getGiveawayTakenTickets } from '../services/giveaways.service.js';
import { logger } from '../services/logger.service.js';
import { Request, Response } from 'express';

export async function listActiveGiveaways(_req: Request, res: Response): Promise<void> {
  try {
    const giveaways = await getActiveGiveaways();
    res.status(200).json({
      data: giveaways,
      success: true,
    });
  } catch (error) {
    logger.app.error('Fallo al procesar listado de sorteos activos', error);
    res.status(500).json({
      error: 'Ha ocurrido un error inesperado al procesar la solicitud. Por favor intenta más tarde.',
      success: false,
    });
  }
}

export async function listWinnersHandler(_req: Request, res: Response): Promise<void> {
  try {
    const winners = await getCompletedGiveawaysWithWinners();
    res.status(200).json({
      data: winners,
      success: true,
    });
  } catch (error) {
    logger.app.error('Fallo al procesar listado de ganadores', error);
    res.status(500).json({
      error: 'Ha ocurrido un error inesperado al procesar la solicitud. Por favor intenta más tarde.',
      success: false,
    });
  }
}


export async function getGiveawayDetail(req: Request, res: Response): Promise<void> {
  try {
    const { uuid } = req.params;
    if (!uuid) {
      res.status(400).json({
        error: 'El identificador del sorteo es requerido.',
        success: false,
      });
      return;
    }

    const giveaway = await getGiveawayByUuid(uuid);
    if (!giveaway) {
      res.status(404).json({
        error: 'El sorteo solicitado no fue encontrado o no está disponible.',
        success: false,
      });
      return;
    }

    res.status(200).json({
      data: giveaway,
      success: true,
    });
  } catch (error) {
    logger.app.error('Fallo al procesar detalle del sorteo', error);
    res.status(500).json({
      error: 'Ha ocurrido un error inesperado al procesar la solicitud. Por favor intenta más tarde.',
      success: false,
    });
  }
}

export async function getGiveawayTicketsHandler(req: Request, res: Response): Promise<void> {
  try {
    const { uuid } = req.params;
    if (!uuid) {
      res.status(400).json({
        error: 'El identificador del sorteo es requerido.',
        success: false,
      });
      return;
    }

    const tickets = await getGiveawayTakenTickets(uuid);
    if (!tickets) {
      res.status(404).json({
        error: 'El sorteo solicitado no fue encontrado o no está disponible.',
        success: false,
      });
      return;
    }

    res.status(200).json({
      data: tickets,
      success: true,
    });
  } catch (error) {
    logger.app.error('Fallo al obtener estado de boletos del sorteo', error);
    res.status(500).json({
      error: 'Ha ocurrido un error inesperado al procesar la solicitud. Por favor intenta más tarde.',
      success: false,
    });
  }
}

export async function getDailyGiveawayHandler(_req: Request, res: Response): Promise<void> {
  try {
    const dailyGiveaway = await getCurrentDailyGiveaway();
    const recentWinners = await getRecentDailyWinners(5);

    if (!dailyGiveaway) {
      res.status(404).json({
        error: 'El sorteo diario no se encuentra disponible en este momento.',
        success: false,
      });
      return;
    }

    res.status(200).json({
      data: {
        giveaway: dailyGiveaway,
        recentWinners,
      },
      success: true,
    });
  } catch (error) {
    logger.app.error('Fallo al obtener sorteo diario', error);
    res.status(500).json({
      error: 'Ha ocurrido un error inesperado al procesar la solicitud. Por favor intenta más tarde.',
      success: false,
    });
  }
}

export async function getDailyWinnersHandler(req: Request, res: Response): Promise<void> {
  try {
    const rawLimit = typeof req.query.limit === 'string' ? parseInt(req.query.limit, 10) : 20;
    const limit = Math.min(50, Math.max(1, isNaN(rawLimit) ? 20 : rawLimit));
    const winners = await getRecentDailyWinners(limit);
    res.status(200).json({
      data: winners,
      success: true,
    });
  } catch (error) {
    logger.app.error('Fallo al obtener ganadores del sorteo diario', error);
    res.status(500).json({
      error: 'Ha ocurrido un error inesperado al procesar la solicitud. Por favor intenta más tarde.',
      success: false,
    });
  }
}


