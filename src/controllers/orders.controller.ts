import crypto from 'crypto';
import { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { redis } from '../config/redis.config.js';
import { recordAudit } from '../services/audit.service.js';
import { processBanxicoBatch } from '../services/banxico.service.js';
import { logger } from '../services/logger.service.js';
import { attachReceipt, getActiveBankAccounts, getOrderByUuid, getOrdersByPhone, reserveTickets } from '../services/orders.service.js';
import { Order } from '../types/order.types.js';
import { normalizeMexicanPhone } from '../utils/phone.util.js';

function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0].trim();
  }
  if (Array.isArray(forwarded) && forwarded.length > 0) {
    return forwarded[0].trim();
  }
  return req.ip || req.socket.remoteAddress || '';
}

function getUserAgent(req: Request): string {
  return (req.get('user-agent') || '').slice(0, 500);
}

export async function reserveOrderHandler(req: Request, res: Response): Promise<void> {
  try {
    const { customerName, customerPhone, customerState, giveawayUuid, ticketNumbers } = req.body;

    if (!customerName || typeof customerName !== 'string' || customerName.trim().length < 2) {
      res.status(400).json({
        error: 'El nombre completo es requerido y debe tener al menos 2 caracteres.',
        success: false,
      });
      return;
    }

    let cleanPhone = normalizeMexicanPhone(customerPhone);
    if (!cleanPhone || cleanPhone.length !== 10) {
      const rawDigits = String(customerPhone || '').replace(/\D/g, '');
      if (rawDigits.length >= 10 && rawDigits.length <= 15) {
        cleanPhone = rawDigits;
      }
    }
    if (!cleanPhone || cleanPhone.length < 10 || cleanPhone.length > 15) {
      res.status(400).json({
        error: 'El número de teléfono debe ser un número celular válido (entre 10 y 15 dígitos).',
        success: false,
      });
      return;
    }

    if (!giveawayUuid || typeof giveawayUuid !== 'string') {
      res.status(400).json({
        error: 'El identificador del sorteo es requerido.',
        success: false,
      });
      return;
    }

    if (!Array.isArray(ticketNumbers) || ticketNumbers.length === 0) {
      res.status(400).json({
        error: 'Debes seleccionar al menos un boleto para apartar.',
        success: false,
      });
      return;
    }

    const result = await reserveTickets({
      customerName,
      customerPhone: cleanPhone,
      customerState: typeof customerState === 'string' ? customerState.trim() : undefined,
      giveawayUuid,
      ipAddress: getClientIp(req),
      ticketNumbers,
      userAgent: getUserAgent(req),
    });

    if (!result.success) {
      if (result.salesClosed) {
        res.status(400).json({
          error: result.error || 'La venta de boletos ha finalizado para este sorteo (menos de 1 hora restante).',
          salesClosed: true,
          success: false,
        });
        return;
      }

      if (result.unavailableTickets && result.unavailableTickets.length > 0) {
        res.status(409).json({
          data: { unavailableTickets: result.unavailableTickets },
          error: 'Uno o más boletos seleccionados acaban de ser apartados o ya no están disponibles.',
          success: false,
        });
        return;
      }

      res.status(400).json({
        error: result.error || 'No fue posible completar el apartado de boletos. Intenta de nuevo.',
        success: false,
      });
      return;
    }

    res.status(201).json({
      data: {
        bankAccounts: result.bankAccounts,
        order: result.order,
      },
      success: true,
    });
  } catch (error) {
    logger.app.error('Error al procesar reserva de boletos', error);
    res.status(500).json({
      error: 'Ha ocurrido un error inesperado al procesar la solicitud. Por favor intenta más tarde.',
      success: false,
    });
  }
}

function maskCustomerName(name: string): string {
  if (!name) return '';
  const parts = name.trim().split(/\s+/);
  return parts
    .map((part) => {
      if (part.length <= 1) return part;
      if (part.length === 2) return `${part.charAt(0)}*`;
      return `${part.charAt(0)}${'*'.repeat(Math.max(part.length - 2, 2))}${part.charAt(part.length - 1)}`;
    })
    .join(' ');
}

function maskPhone(phone: string): string {
  const clean = phone.trim();
  if (clean.length <= 4) return '****';
  return `${'*'.repeat(clean.length - 4)}${clean.slice(-4)}`;
}

function maskTrackingKey(key: string | null): string | null {
  if (!key) return null;
  if (key.length <= 6) return '******';
  return `${key.slice(0, 3)}${'*'.repeat(Math.max(key.length - 6, 3))}${key.slice(-3)}`;
}

function maskReference(ref: string | null): string | null {
  if (!ref) return null;
  if (ref.length <= 4) return '****';
  return `${'*'.repeat(ref.length - 4)}${ref.slice(-4)}`;
}

function maskOrder(order: Order): Order {
  return {
    bank_reference: maskReference(order.bank_reference),
    concept_reference: order.concept_reference,
    created_at: order.created_at,
    currency: order.currency,
    customer_name: maskCustomerName(order.customer_name),
    customer_phone: maskPhone(order.customer_phone),
    expires_at: order.expires_at,
    giveaway_id: order.giveaway_id,
    giveaway_status: order.giveaway_status,
    giveaway_title: order.giveaway_title,
    giveaway_uuid: order.giveaway_uuid,
    has_receipt: Boolean(order.receipt_url || order.receipt_filename),
    id: undefined,
    is_winner: order.is_winner,
    receipt_filename: null,
    receipt_url: null,
    status: order.status,
    ticket_count: order.ticket_count,
    ticket_numbers: order.ticket_numbers,
    total_amount: order.total_amount,
    tracking_key: maskTrackingKey(order.tracking_key),
    updated_at: order.updated_at,
    uuid: order.uuid,
    winner_name: order.winner_name ? maskCustomerName(order.winner_name) : null,
    winner_ticket_number: order.winner_ticket_number,
  };
}

export async function lookupOrdersHandler(req: Request, res: Response): Promise<void> {
  try {
    const { phone } = req.body;
    let cleanPhone = normalizeMexicanPhone(phone);
    if (!cleanPhone || cleanPhone.length !== 10) {
      const rawDigits = String(phone || '').replace(/\D/g, '');
      if (rawDigits.length >= 10 && rawDigits.length <= 15) {
        cleanPhone = rawDigits;
      }
    }
    if (!cleanPhone || cleanPhone.length < 10 || cleanPhone.length > 15) {
      res.status(400).json({
        error: 'Debes proporcionar un número de teléfono válido (entre 10 y 15 dígitos).',
        success: false,
      });
      return;
    }

    const orders = await getOrdersByPhone(cleanPhone);

    await recordAudit({
      action: 'ORDER_LOOKUP',
      actor_type: 'customer',
      customer_phone: cleanPhone,
      details: {
        results_count: orders.length,
      },
      ip_address: getClientIp(req),
      user_agent: getUserAgent(req),
    });

    const maskedOrders = orders.map((o) => maskOrder(o));
    res.status(200).json({
      data: maskedOrders,
      success: true,
    });
  } catch (error) {
    logger.app.error('Error al buscar órdenes por teléfono', error);
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

    const order = await getOrderByUuid(uuid);
    if (!order) {
      res.status(404).json({
        error: 'La orden solicitada no existe o ha expirado.',
        success: false,
      });
      return;
    }

    await recordAudit({
      action: 'ORDER_DETAILS_ACCESSED',
      actor_type: 'customer',
      amount: order.total_amount,
      currency: order.currency,
      customer_name: order.customer_name,
      customer_phone: order.customer_phone,
      details: {
        status: order.status,
        ticket_count: order.ticket_count,
      },
      ip_address: getClientIp(req),
      order_id: order.id,
      order_uuid: order.uuid,
      previous_status: order.status,
      user_agent: getUserAgent(req),
    });

    res.status(200).json({
      data: maskOrder(order),
      success: true,
    });
  } catch (error) {
    logger.app.error('Error al obtener detalle de la orden', error);
    res.status(500).json({
      error: 'Ha ocurrido un error inesperado al procesar la solicitud. Por favor intenta más tarde.',
      success: false,
    });
  }
}

export async function getBankAccountsHandler(req: Request, res: Response): Promise<void> {
  try {
    const giveaway = req.query.giveaway as string | undefined;
    const accounts = await getActiveBankAccounts(giveaway);
    res.status(200).json({
      data: accounts,
      success: true,
    });
  } catch (error) {
    logger.app.error('Error al obtener cuentas bancarias', error);
    res.status(500).json({
      error: 'Ha ocurrido un error inesperado al procesar la solicitud. Por favor intenta más tarde.',
      success: false,
    });
  }
}

export async function uploadReceiptHandler(req: Request, res: Response): Promise<void> {
  let createdFilePath: string | null = null;
  try {
    const { bankReference, imageBase64, orderUuid, trackingKey } = req.body;

    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!orderUuid || typeof orderUuid !== 'string' || !UUID_REGEX.test(orderUuid)) {
      res.status(400).json({
        error: 'El identificador de la orden es requerido y debe tener un formato válido.',
        success: false,
      });
      return;
    }

    if (!imageBase64 || typeof imageBase64 !== 'string') {
      res.status(400).json({
        error: 'Debes proporcionar la imagen o PDF del comprobante.',
        success: false,
      });
      return;
    }

    const storageDir = path.join(process.cwd(), 'storage', 'receipts');
    if (!fs.existsSync(storageDir)) {
      fs.mkdirSync(storageDir, { recursive: true });
    }

    const matches = imageBase64.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
    const rawBase64 = matches && matches.length === 3 ? matches[2] : imageBase64;
    const buffer = Buffer.from(rawBase64, 'base64');

    if (buffer.length > 5 * 1024 * 1024) {
      res.status(400).json({
        error: 'El comprobante excede el tamaño máximo permitido de 5 MB.',
        success: false,
      });
      return;
    }

    const fileHash = crypto.createHash('sha256').update(buffer).digest('hex');
    try {
      const existingOrderUuid = await redis.get(`boreal:receipt_hash:${fileHash}`);
      if (existingOrderUuid && existingOrderUuid !== orderUuid) {
        res.status(400).json({
          error: 'Este comprobante ya fue registrado previamente para otra orden. No se admiten comprobantes duplicados.',
          success: false,
        });
        return;
      }
    } catch (redisErr) {
      logger.app.warn('Advertencia al verificar hash anti-replay en Redis:', redisErr);
    }

    let ext = '';
    if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
      ext = 'jpg';
    } else if (
      buffer.length >= 8 &&
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47
    ) {
      ext = 'png';
    } else if (
      buffer.length >= 12 &&
      buffer.subarray(0, 4).toString() === 'RIFF' &&
      buffer.subarray(8, 12).toString() === 'WEBP'
    ) {
      ext = 'webp';
    } else if (buffer.length >= 4 && buffer.subarray(0, 4).toString() === '%PDF') {
      ext = 'pdf';
    } else {
      res.status(400).json({
        error: 'El formato del archivo no es válido. Solo se aceptan imágenes JPG, PNG, WebP o documentos PDF.',
        success: false,
      });
      return;
    }

    const fileName = `receipt-${orderUuid}-${Date.now()}.${ext}`;
    createdFilePath = path.join(storageDir, fileName);
    fs.writeFileSync(createdFilePath, buffer);

    const receiptUrl = `/api/orders/${orderUuid}/receipt`;

    const updatedOrder = await attachReceipt({
      bankReference,
      ipAddress: getClientIp(req),
      orderUuid,
      receiptFilename: fileName,
      receiptUrl,
      trackingKey,
      userAgent: getUserAgent(req),
    });

    if (!updatedOrder) {
      if (createdFilePath && fs.existsSync(createdFilePath)) {
        fs.unlinkSync(createdFilePath);
      }
      res.status(404).json({
        error: 'La orden indicada no fue encontrada o ya no está disponible.',
        success: false,
      });
      return;
    }

    try {
      await redis.set(`boreal:receipt_hash:${fileHash}`, orderUuid, 'EX', 90 * 86400);
    } catch (_) {}

    if (trackingKey) {
      void processBanxicoBatch().catch((batchErr) => {
        logger.app.error('Error al procesar lote Banxico tras recepción de comprobante', batchErr);
      });
    }

    res.status(200).json({
      data: maskOrder(updatedOrder),
      message: 'Comprobante registrado exitosamente. Tu pago pasará a validación Banxico.',
      success: true,
    });
  } catch (error) {
    if (createdFilePath && fs.existsSync(createdFilePath)) {
      try {
        fs.unlinkSync(createdFilePath);
      } catch (_) {}
    }
    if ((error as Error).message === 'ORDER_EXPIRED') {
      res.status(400).json({
        error: 'El tiempo límite de 30 minutos para subir el comprobante ha expirado. Por favor aparta tus boletos nuevamente.',
        success: false,
      });
      return;
    }
    if ((error as Error).message === 'DUPLICATE_TRACKING_KEY') {
      res.status(400).json({
        error: 'Esta clave de rastreo SPEI ya fue registrada previamente en otra orden.',
        success: false,
      });
      return;
    }
    logger.app.error('Error al registrar comprobante de pago', error);
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

    const order = await getOrderByUuid(uuid);
    if (!order || !order.receipt_url) {
      res.status(404).json({
        error: 'El comprobante solicitado no fue encontrado o no está disponible.',
        success: false,
      });
      return;
    }

    const storageDir = path.join(process.cwd(), 'storage', 'receipts');
    if (order.receipt_filename) {
      const directPath = path.join(storageDir, order.receipt_filename);
      if (fs.existsSync(directPath)) {
        res.setHeader('Cache-Control', 'private, no-cache');
        res.sendFile(directPath);
        return;
      }
    }

    const publicLegacyDir = path.join(process.cwd(), 'public', 'uploads', 'receipts');
    if (order.receipt_filename) {
      const directLegacyPath = path.join(publicLegacyDir, order.receipt_filename);
      if (fs.existsSync(directLegacyPath)) {
        res.setHeader('Cache-Control', 'private, no-cache');
        res.sendFile(directLegacyPath);
        return;
      }
    }

    res.status(404).json({
      error: 'El comprobante solicitado no existe en el almacenamiento.',
      success: false,
    });
  } catch (error) {
    logger.app.error('Error al descargar comprobante', error);
    res.status(500).json({
      error: 'Ha ocurrido un error inesperado al procesar la solicitud. Por favor intenta más tarde.',
      success: false,
    });
  }
}

