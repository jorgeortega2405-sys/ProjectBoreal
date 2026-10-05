import { Response } from 'express';
import fs from 'fs';
import path from 'path';
import { logger } from '../services/logger.service.js';
import { approveAdminOrder, cancelAdminOrder, getAdminOrderReceiptFilename, getAdminOrders, getAdminSpeiQueue, triggerSpeiValidationBatch } from '../services/orders.service.js';
import { AuthenticatedAdminRequest } from '../types/auth.types.js';

export async function getOrdersHandler(req: AuthenticatedAdminRequest, res: Response): Promise<void> {
  try {
    const page = req.query.page ? parseInt(String(req.query.page), 10) : 1;
    const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 25;
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const search = typeof req.query.search === 'string' ? req.query.search : undefined;

    const result = await getAdminOrders({ limit, page, search, status });
    res.status(200).json(result);
  } catch (error) {
    logger.app.error('Error en getOrdersHandler', error);
    res.status(500).json({ error: 'Ha ocurrido un error inesperado al procesar la solicitud. Por favor intenta más tarde.' });
  }
}

export async function approveOrderHandler(req: AuthenticatedAdminRequest, res: Response): Promise<void> {
  const { uuid } = req.params;
  if (!uuid) {
    res.status(400).json({ error: 'Identificador de orden requerido.' });
    return;
  }

  if (!req.adminUser) {
    res.status(401).json({ error: 'No autorizado. Sesión de administrador requerida.' });
    return;
  }
  const adminUser = req.adminUser;

  try {
    const result = await approveAdminOrder(uuid, adminUser);
    res.status(200).json({
      message: 'Pago aprobado y boletos confirmados exitosamente.',
      result,
      success: true,
    });
  } catch (error) {
    logger.app.error(`Error al aprobar orden ${uuid}`, error);
    res.status(500).json({ error: 'Ha ocurrido un error inesperado al procesar la solicitud. Por favor intenta más tarde.' });
  }
}

export async function cancelOrderHandler(req: AuthenticatedAdminRequest, res: Response): Promise<void> {
  const { uuid } = req.params;
  if (!uuid) {
    res.status(400).json({ error: 'Identificador de orden requerido.' });
    return;
  }

  if (!req.adminUser) {
    res.status(401).json({ error: 'No autorizado. Sesión de administrador requerida.' });
    return;
  }
  const adminUser = req.adminUser;

  const reason = typeof req.body?.reason === 'string' ? req.body.reason : undefined;

  try {
    const result = await cancelAdminOrder(uuid, adminUser, reason);
    res.status(200).json({
      message: 'Orden cancelada y boletos liberados exitosamente.',
      result,
      success: true,
    });
  } catch (error) {
    logger.app.error(`Error al cancelar orden ${uuid}`, error);
    res.status(500).json({ error: 'Ha ocurrido un error inesperado al procesar la solicitud. Por favor intenta más tarde.' });
  }
}

export async function getSpeiQueueHandler(_req: AuthenticatedAdminRequest, res: Response): Promise<void> {
  try {
    const queue = await getAdminSpeiQueue();
    res.status(200).json({ queue });
  } catch (error) {
    logger.app.error('Error en getSpeiQueueHandler', error);
    res.status(500).json({ error: 'Ha ocurrido un error al consultar la cola SPEI.' });
  }
}

export async function triggerSpeiBatchHandler(_req: AuthenticatedAdminRequest, res: Response): Promise<void> {
  try {
    const result = await triggerSpeiValidationBatch();
    res.status(200).json({
      message: `Procesamiento de cola SPEI finalizado (${result.processed} transferencias validadas).`,
      processed: result.processed,
      success: true,
    });
  } catch (error) {
    logger.app.error('Error en triggerSpeiBatchHandler', error);
    res.status(500).json({ error: 'Ha ocurrido un error al procesar el lote de validación SPEI.' });
  }
}

export async function getOrderReceiptHandler(req: AuthenticatedAdminRequest, res: Response): Promise<void> {
  const { uuid } = req.params;
  if (!uuid) {
    res.status(400).json({ error: 'Identificador de orden requerido.' });
    return;
  }

  try {
    const filename = await getAdminOrderReceiptFilename(uuid);
    if (!filename) {
      res.status(404).json({ error: 'El comprobante solicitado no fue encontrado.' });
      return;
    }

    const storageDir = path.join(process.cwd(), 'storage', 'receipts');
    const directPath = path.join(storageDir, filename);
    if (fs.existsSync(directPath)) {
      res.setHeader('Cache-Control', 'private, no-cache');
      res.sendFile(directPath);
      return;
    }

    const legacyPath = path.join(process.cwd(), 'public', 'uploads', 'receipts', filename);
    if (fs.existsSync(legacyPath)) {
      res.setHeader('Cache-Control', 'private, no-cache');
      res.sendFile(legacyPath);
      return;
    }

    res.status(404).json({ error: 'El comprobante solicitado no existe en el almacenamiento.' });
  } catch (error) {
    logger.app.error(`Error al consultar comprobante de orden ${uuid}`, error);
    res.status(500).json({ error: 'Error al obtener el comprobante de la orden.' });
  }
}
