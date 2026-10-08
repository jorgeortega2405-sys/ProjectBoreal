import { logger } from '../services/logger.service.js';
import { ordersService } from '../services/orders.service.js';
import { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';

export async function getOrdersHandler(req: Request, res: Response): Promise<void> {
  try {
    const { giveawayUuid, limit, page, search, status } = req.query;

    const result = await ordersService.getOrdersList({
      giveawayUuid: typeof giveawayUuid === 'string' ? giveawayUuid : undefined,
      limit: typeof limit === 'string' ? Number(limit) : undefined,
      page: typeof page === 'string' ? Number(page) : undefined,
      search: typeof search === 'string' ? search : undefined,
      status: typeof status === 'string' ? status : undefined,
    });

    res.status(200).json({
      data: result.orders,
      pagination: result.pagination,
      success: true,
    });
  } catch (error) {
    logger.app.error('Error al obtener lista administrativa de órdenes', error);
    res.status(500).json({
      error: 'Ha ocurrido un error inesperado al procesar la solicitud. Por favor intenta más tarde.',
      success: false,
    });
  }
}

export async function getPaymentKpisHandler(_req: Request, res: Response): Promise<void> {
  try {
    const kpis = await ordersService.getPaymentKpis();
    res.status(200).json({
      data: kpis,
      success: true,
    });
  } catch (error) {
    logger.app.error('Error al obtener KPIs de pagos', error);
    res.status(500).json({
      error: 'Ha ocurrido un error inesperado al procesar la solicitud. Por favor intenta más tarde.',
      success: false,
    });
  }
}

export async function getOrderDetailHandler(req: Request, res: Response): Promise<void> {
  try {
    const { uuid } = req.params;
    if (!uuid) {
      res.status(400).json({
        error: 'El identificador de la orden es requerido.',
        success: false,
      });
      return;
    }

    const order = await ordersService.getOrderDetail(uuid);
    if (!order) {
      res.status(404).json({
        error: 'La orden solicitada no fue encontrada.',
        success: false,
      });
      return;
    }

    res.status(200).json({
      data: order,
      success: true,
    });
  } catch (error) {
    logger.app.error('Error al obtener detalle administrativo de la orden', error);
    res.status(500).json({
      error: 'Ha ocurrido un error inesperado al procesar la solicitud. Por favor intenta más tarde.',
      success: false,
    });
  }
}

export async function approveOrderHandler(req: Request, res: Response): Promise<void> {
  try {
    const { uuid } = req.params;
    const { notes } = req.body || {};

    if (!uuid) {
      res.status(400).json({
        error: 'El identificador de la orden es requerido.',
        success: false,
      });
      return;
    }

    const result = await ordersService.approveOrderManual(uuid, typeof notes === 'string' ? notes.trim() : undefined);
    if (!result.success) {
      res.status(400).json({
        error: 'No fue posible aprobar la orden especificada. Verifica que pertenezca a un sorteo activo.',
        success: false,
      });
      return;
    }

    res.status(200).json({
      data: result.order,
      message: 'Pago aprobado y boletos liquidados exitosamente.',
      success: true,
    });
  } catch (error) {
    logger.app.error('Error al aprobar orden manualmente', error);
    res.status(500).json({
      error: 'Ha ocurrido un error inesperado al procesar la solicitud. Por favor intenta más tarde.',
      success: false,
    });
  }
}

export async function rejectOrderHandler(req: Request, res: Response): Promise<void> {
  try {
    const { uuid } = req.params;
    const { reason } = req.body || {};

    if (!uuid) {
      res.status(400).json({
        error: 'El identificador de la orden es requerido.',
        success: false,
      });
      return;
    }

    if (!reason || typeof reason !== 'string' || reason.trim().length < 3) {
      res.status(400).json({
        error: 'Debes proporcionar un motivo válido para rechazar el comprobante (mínimo 3 caracteres).',
        success: false,
      });
      return;
    }

    const result = await ordersService.rejectOrderManual(uuid, reason.trim());
    if (!result.success) {
      res.status(400).json({
        error: 'No fue posible rechazar la orden especificada.',
        success: false,
      });
      return;
    }

    res.status(200).json({
      data: result.order,
      message: 'Comprobante rechazado y boletos liberados exitosamente.',
      success: true,
    });
  } catch (error) {
    logger.app.error('Error al rechazar orden manualmente', error);
    res.status(500).json({
      error: 'Ha ocurrido un error inesperado al procesar la solicitud. Por favor intenta más tarde.',
      success: false,
    });
  }
}

export async function updateTrackingKeyHandler(req: Request, res: Response): Promise<void> {
  try {
    const { uuid } = req.params;
    const { trackingKey } = req.body || {};

    if (!uuid) {
      res.status(400).json({
        error: 'El identificador de la orden es requerido.',
        success: false,
      });
      return;
    }

    if (!trackingKey || typeof trackingKey !== 'string' || trackingKey.trim().length < 5) {
      res.status(400).json({
        error: 'La clave de rastreo SPEI debe tener al menos 5 caracteres.',
        success: false,
      });
      return;
    }

    const updated = await ordersService.updateTrackingKey(uuid, trackingKey);
    if (!updated) {
      res.status(400).json({
        error: 'No fue posible actualizar la clave de rastreo.',
        success: false,
      });
      return;
    }

    res.status(200).json({
      data: updated,
      message: 'Clave de rastreo actualizada y validación automática reprogramada.',
      success: true,
    });
  } catch (error) {
    logger.app.error('Error al actualizar clave de rastreo', error);
    res.status(500).json({
      error: 'Ha ocurrido un error inesperado al procesar la solicitud. Por favor intenta más tarde.',
      success: false,
    });
  }
}

export async function getOrderReceiptHandler(req: Request, res: Response): Promise<void> {
  try {
    const { uuid } = req.params;
    if (!uuid) {
      res.status(400).json({
        error: 'El identificador de la orden es requerido.',
        success: false,
      });
      return;
    }

    const order = await ordersService.getOrderDetail(uuid);
    if (!order || !order.receipt_filename) {
      res.status(404).json({
        error: 'El comprobante solicitado no fue encontrado.',
        success: false,
      });
      return;
    }

    const cleanFilename = path.basename(order.receipt_filename);
    const storagePaths = [
      path.resolve(process.cwd(), '..', 'storage', 'receipts', cleanFilename),
      path.resolve(process.cwd(), 'storage', 'receipts', cleanFilename),
    ];

    let foundPath: string | null = null;
    for (const sp of storagePaths) {
      if (fs.existsSync(sp)) {
        foundPath = sp;
        break;
      }
    }

    if (!foundPath) {
      res.status(404).json({
        error: 'El archivo físico del comprobante no existe en almacenamiento.',
        success: false,
      });
      return;
    }

    res.setHeader('Cache-Control', 'private, no-cache');
    res.sendFile(foundPath);
  } catch (error) {
    logger.app.error('Error al transmitir comprobante en Admin', error);
    res.status(500).json({
      error: 'Ha ocurrido un error inesperado al procesar la solicitud. Por favor intenta más tarde.',
      success: false,
    });
  }
}
