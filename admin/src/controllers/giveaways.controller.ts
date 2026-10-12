import { createAdminGiveaway, getAllAdminGiveaways, getAdminGiveawayByUuid, updateAdminGiveaway } from '../services/giveaways.service.js';
import { logger } from '../services/logger.service.js';
import { AuthenticatedAdminRequest } from '../types/auth.types.js';
import { Response } from 'express';

export async function listGiveaways(_req: AuthenticatedAdminRequest, res: Response): Promise<void> {
  try {
    const giveaways = await getAllAdminGiveaways();
    res.status(200).json({
      data: giveaways,
      success: true,
    });
  } catch (error) {
    logger.app.error('Fallo al procesar listado de sorteos en panel administrativo', error);
    res.status(500).json({
      error: 'Ha ocurrido un error inesperado al procesar la solicitud. Por favor intenta más tarde.',
      success: false,
    });
  }
}

export async function getGiveawayDetailHandler(req: AuthenticatedAdminRequest, res: Response): Promise<void> {
  try {
    const { uuid } = req.params;
    if (!uuid) {
      res.status(400).json({
        error: 'El identificador del sorteo es requerido.',
        success: false,
      });
      return;
    }

    const giveaway = await getAdminGiveawayByUuid(uuid);
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
  } catch (error) {
    logger.app.error('Fallo al obtener detalle del sorteo en panel administrativo', error);
    res.status(500).json({
      error: 'Ha ocurrido un error inesperado al procesar la solicitud. Por favor intenta más tarde.',
      success: false,
    });
  }
}

export async function createGiveawayHandler(req: AuthenticatedAdminRequest, res: Response): Promise<void> {
  try {
    const {
      countdown_hours,
      currency,
      description,
      end_date,
      image_urls,
      min_threshold_pct,
      primary_image_url,
      start_date,
      status,
      ticket_price,
      title,
      total_tickets,
    } = req.body;

    if (!title || !ticket_price || !total_tickets || !primary_image_url || !end_date) {
      res.status(400).json({
        error: 'Los campos título, precio, total de boletos, imagen principal y fecha de fin son obligatorios.',
        success: false,
      });
      return;
    }

    const parsedPrice = Number(ticket_price);
    if (isNaN(parsedPrice) || parsedPrice <= 0) {
      res.status(400).json({
        error: 'El precio por boleto debe ser un valor numérico mayor a cero.',
        success: false,
      });
      return;
    }

    const parsedTotalTickets = parseInt(String(total_tickets), 10);
    if (isNaN(parsedTotalTickets) || parsedTotalTickets <= 0) {
      res.status(400).json({
        error: 'El total de boletos debe ser un número entero mayor a cero.',
        success: false,
      });
      return;
    }

    const startTimestamp = start_date ? new Date(start_date).getTime() : Date.now();
    const endTimestamp = new Date(end_date).getTime();
    if (isNaN(endTimestamp) || endTimestamp <= startTimestamp) {
      res.status(400).json({
        error: 'La fecha de finalización debe ser posterior a la fecha de inicio del sorteo.',
        success: false,
      });
      return;
    }

    const created = await createAdminGiveaway({
      countdown_hours: Number(countdown_hours) || 48,
      currency: currency || 'MXN',
      description: description || null,
      end_date: String(end_date),
      image_urls: Array.isArray(image_urls) ? image_urls : null,
      min_threshold_pct: Number(min_threshold_pct) || 0,
      primary_image_url: String(primary_image_url),
      start_date: start_date ? String(start_date) : undefined,
      status: status || 'active',
      ticket_price: parsedPrice,
      title: String(title).trim(),
      total_tickets: parsedTotalTickets,
    });

    res.status(201).json({
      data: created,
      success: true,
    });
  } catch (error) {
    logger.app.error('Fallo al crear sorteo en panel administrativo', error);
    res.status(500).json({
      error: 'Ha ocurrido un error inesperado al procesar la solicitud. Por favor intenta más tarde.',
      success: false,
    });
  }
}

export async function updateGiveawayHandler(req: AuthenticatedAdminRequest, res: Response): Promise<void> {
  try {
    const { uuid } = req.params;
    if (!uuid) {
      res.status(400).json({
        error: 'El identificador del sorteo es requerido.',
        success: false,
      });
      return;
    }

    const {
      countdown_hours,
      currency,
      description,
      end_date,
      image_urls,
      min_threshold_pct,
      primary_image_url,
      start_date,
      status,
      ticket_price,
      title,
      total_tickets,
    } = req.body;

    if (ticket_price !== undefined) {
      const parsedPrice = Number(ticket_price);
      if (isNaN(parsedPrice) || parsedPrice <= 0) {
        res.status(400).json({
          error: 'El precio por boleto debe ser un valor numérico mayor a cero.',
          success: false,
        });
        return;
      }
    }

    if (total_tickets !== undefined) {
      const parsedTotal = parseInt(String(total_tickets), 10);
      if (isNaN(parsedTotal) || parsedTotal <= 0) {
        res.status(400).json({
          error: 'El total de boletos debe ser un número entero mayor a cero.',
          success: false,
        });
        return;
      }
    }

    if (end_date !== undefined && start_date !== undefined) {
      if (new Date(end_date).getTime() <= new Date(start_date).getTime()) {
        res.status(400).json({
          error: 'La fecha de finalización debe ser posterior a la fecha de inicio del sorteo.',
          success: false,
        });
        return;
      }
    }

    const updated = await updateAdminGiveaway(uuid, {
      countdown_hours: countdown_hours !== undefined ? Number(countdown_hours) : undefined,
      currency: currency !== undefined ? String(currency) : undefined,
      description: description !== undefined ? (description ? String(description) : null) : undefined,
      end_date: end_date !== undefined ? String(end_date) : undefined,
      image_urls: Array.isArray(image_urls) ? image_urls : undefined,
      min_threshold_pct: min_threshold_pct !== undefined ? Number(min_threshold_pct) : undefined,
      primary_image_url: primary_image_url !== undefined ? String(primary_image_url) : undefined,
      start_date: start_date !== undefined ? String(start_date) : undefined,
      status: status !== undefined ? String(status) : undefined,
      ticket_price: ticket_price !== undefined ? Number(ticket_price) : undefined,
      title: title !== undefined ? String(title).trim() : undefined,
      total_tickets: total_tickets !== undefined ? parseInt(String(total_tickets), 10) : undefined,
    });

    if (!updated) {
      res.status(404).json({
        error: 'El sorteo solicitado no fue encontrado para actualizar.',
        success: false,
      });
      return;
    }

    res.status(200).json({
      success: true,
    });
  } catch (error) {
    logger.app.error('Fallo al actualizar sorteo en panel administrativo', error);
    res.status(500).json({
      error: 'Ha ocurrido un error inesperado al procesar la solicitud. Por favor intenta más tarde.',
      success: false,
    });
  }
}
