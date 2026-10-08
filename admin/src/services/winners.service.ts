import { pool } from '../config/database.config.js';
import { logger } from './logger.service.js';
import { RowDataPacket } from 'mysql2/promise';

export interface WinnerItem {
  contact_notes: string | null;
  delivered_at: string | null;
  delivery_status: 'pending_contact' | 'contacted' | 'claimed' | 'delivered';
  evidence_image_url: string | null;
  giveaway_id: number;
  giveaway_primary_image_url: string;
  giveaway_title: string;
  giveaway_type: 'standard' | 'daily';
  giveaway_uuid: string;
  prize_amount: number | null;
  spei_receipt_url: string | null;
  testimonial: string | null;
  ticket_price: number;
  winner_announced_at: string;
  winner_name: string;
  winner_order_id: number | null;
  winner_order_uuid: string | null;
  winner_phone: string | null;
  winner_state: string | null;
  winner_ticket_number: number;
}

export interface WinnersKpis {
  deliveredCount: number;
  pendingDeliveryCount: number;
  totalPrizesDistributedAmount: number;
  totalWinnersCount: number;
}

export interface UpdateWinnerDeliveryInput {
  contact_notes?: string | null;
  delivered_at?: string | null;
  delivery_status: 'pending_contact' | 'contacted' | 'claimed' | 'delivered';
  evidence_image_url?: string | null;
  spei_receipt_url?: string | null;
  testimonial?: string | null;
}

export async function getWinnersKpis(): Promise<WinnersKpis> {
  try {
    const [giveawayStats] = await pool.query<RowDataPacket[]>(
      `SELECT
        COUNT(*) as total_winners,
        COALESCE(SUM(COALESCE(prize_amount, ticket_price * total_tickets)), 0) as total_prizes_amount
       FROM giveaways
       WHERE status = 'completed' AND winner_ticket_number IS NOT NULL`
    );

    const [deliveryStats] = await pool.query<RowDataPacket[]>(
      `SELECT
        SUM(CASE WHEN wd.delivery_status = 'delivered' THEN 1 ELSE 0 END) as delivered_count,
        SUM(CASE WHEN wd.delivery_status != 'delivered' OR wd.delivery_status IS NULL THEN 1 ELSE 0 END) as pending_count
       FROM giveaways g
       LEFT JOIN winner_deliveries wd ON wd.giveaway_id = g.id
       WHERE g.status = 'completed' AND g.winner_ticket_number IS NOT NULL`
    );

    const g = giveawayStats[0] || {};
    const d = deliveryStats[0] || {};

    return {
      deliveredCount: Number(d.delivered_count || 0),
      pendingDeliveryCount: Number(d.pending_count || 0),
      totalPrizesDistributedAmount: Number(g.total_prizes_amount || 0),
      totalWinnersCount: Number(g.total_winners || 0),
    };
  } catch (error) {
    logger.db.error('Error al obtener KPIs de ganadores:', error);
    return {
      deliveredCount: 0,
      pendingDeliveryCount: 0,
      totalPrizesDistributedAmount: 0,
      totalWinnersCount: 0,
    };
  }
}

export async function getAllWinners(filters?: {
  deliveryStatus?: string;
  search?: string;
}): Promise<WinnerItem[]> {
  try {
    let whereClause = "g.status = 'completed' AND g.winner_ticket_number IS NOT NULL";
    const params: unknown[] = [];

    if (filters?.deliveryStatus && filters.deliveryStatus !== 'all') {
      whereClause += ' AND COALESCE(wd.delivery_status, \'pending_contact\') = ?';
      params.push(filters.deliveryStatus);
    }

    if (filters?.search && filters.search.trim()) {
      const q = `%${filters.search.trim()}%`;
      whereClause += ' AND (g.title LIKE ? OR g.winner_name LIKE ? OR o.customer_phone LIKE ? OR o.uuid LIKE ?)';
      params.push(q, q, q, q);
    }

    const query = `
      SELECT
        g.id AS giveaway_id,
        g.uuid AS giveaway_uuid,
        g.title AS giveaway_title,
        g.type AS giveaway_type,
        g.primary_image_url AS giveaway_primary_image_url,
        g.prize_amount,
        g.ticket_price,
        g.winner_ticket_number,
        g.winner_name,
        g.winner_order_id,
        g.winner_announced_at,
        o.uuid AS winner_order_uuid,
        o.customer_phone AS winner_phone,
        o.customer_state AS winner_state,
        COALESCE(wd.delivery_status, 'pending_contact') AS delivery_status,
        wd.contact_notes,
        wd.evidence_image_url,
        wd.spei_receipt_url,
        wd.testimonial,
        wd.delivered_at
      FROM giveaways g
      LEFT JOIN orders o ON o.id = g.winner_order_id
      LEFT JOIN winner_deliveries wd ON wd.giveaway_id = g.id
      WHERE ${whereClause}
      ORDER BY g.winner_announced_at DESC, g.id DESC
    `;

    const [rows] = await pool.query<RowDataPacket[]>(query, params);

    return rows.map((r) => ({
      contact_notes: r.contact_notes || null,
      delivered_at: r.delivered_at || null,
      delivery_status: r.delivery_status || 'pending_contact',
      evidence_image_url: r.evidence_image_url || null,
      giveaway_id: r.giveaway_id,
      giveaway_primary_image_url: r.giveaway_primary_image_url,
      giveaway_title: r.giveaway_title,
      giveaway_type: r.giveaway_type,
      giveaway_uuid: r.giveaway_uuid,
      prize_amount: r.prize_amount !== null ? Number(r.prize_amount) : null,
      spei_receipt_url: r.spei_receipt_url || null,
      testimonial: r.testimonial || null,
      ticket_price: Number(r.ticket_price || 0),
      winner_announced_at: r.winner_announced_at,
      winner_name: r.winner_name || 'Sin nombre',
      winner_order_id: r.winner_order_id,
      winner_order_uuid: r.winner_order_uuid || null,
      winner_phone: r.winner_phone || null,
      winner_state: r.winner_state || null,
      winner_ticket_number: Number(r.winner_ticket_number),
    }));
  } catch (error) {
    logger.db.error('Error al listar ganadores en admin:', error);
    return [];
  }
}

export async function getWinnerDetail(giveawayUuid: string): Promise<WinnerItem | null> {
  try {
    const query = `
      SELECT
        g.id AS giveaway_id,
        g.uuid AS giveaway_uuid,
        g.title AS giveaway_title,
        g.type AS giveaway_type,
        g.primary_image_url AS giveaway_primary_image_url,
        g.prize_amount,
        g.ticket_price,
        g.winner_ticket_number,
        g.winner_name,
        g.winner_order_id,
        g.winner_announced_at,
        o.uuid AS winner_order_uuid,
        o.customer_phone AS winner_phone,
        o.customer_state AS winner_state,
        COALESCE(wd.delivery_status, 'pending_contact') AS delivery_status,
        wd.contact_notes,
        wd.evidence_image_url,
        wd.spei_receipt_url,
        wd.testimonial,
        wd.delivered_at
      FROM giveaways g
      LEFT JOIN orders o ON o.id = g.winner_order_id
      LEFT JOIN winner_deliveries wd ON wd.giveaway_id = g.id
      WHERE g.uuid = ? AND g.status = 'completed' AND g.winner_ticket_number IS NOT NULL
    `;

    const [rows] = await pool.query<RowDataPacket[]>(query, [giveawayUuid]);
    if (rows.length === 0) return null;

    const r = rows[0];
    return {
      contact_notes: r.contact_notes || null,
      delivered_at: r.delivered_at || null,
      delivery_status: r.delivery_status || 'pending_contact',
      evidence_image_url: r.evidence_image_url || null,
      giveaway_id: r.giveaway_id,
      giveaway_primary_image_url: r.giveaway_primary_image_url,
      giveaway_title: r.giveaway_title,
      giveaway_type: r.giveaway_type,
      giveaway_uuid: r.giveaway_uuid,
      prize_amount: r.prize_amount !== null ? Number(r.prize_amount) : null,
      spei_receipt_url: r.spei_receipt_url || null,
      testimonial: r.testimonial || null,
      ticket_price: Number(r.ticket_price || 0),
      winner_announced_at: r.winner_announced_at,
      winner_name: r.winner_name || 'Sin nombre',
      winner_order_id: r.winner_order_id,
      winner_order_uuid: r.winner_order_uuid || null,
      winner_phone: r.winner_phone || null,
      winner_state: r.winner_state || null,
      winner_ticket_number: Number(r.winner_ticket_number),
    };
  } catch (error) {
    logger.db.error('Error al obtener detalle del ganador:', error);
    return null;
  }
}

export async function updateWinnerDelivery(
  giveawayUuid: string,
  input: UpdateWinnerDeliveryInput
): Promise<WinnerItem> {
  const winner = await getWinnerDetail(giveawayUuid);
  if (!winner) {
    throw new Error('El sorteo con ganador solicitado no existe.');
  }

  const validStatuses = ['pending_contact', 'contacted', 'claimed', 'delivered'];
  if (!validStatuses.includes(input.delivery_status)) {
    throw new Error('El estado de entrega proporcionado no es válido.');
  }

  const deliveredAt = input.delivery_status === 'delivered'
    ? (input.delivered_at ? new Date(input.delivered_at) : new Date())
    : null;

  try {
    await pool.query(
      `INSERT INTO winner_deliveries (giveaway_id, delivery_status, contact_notes, evidence_image_url, spei_receipt_url, testimonial, delivered_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         delivery_status = VALUES(delivery_status),
         contact_notes = VALUES(contact_notes),
         evidence_image_url = VALUES(evidence_image_url),
         spei_receipt_url = VALUES(spei_receipt_url),
         testimonial = VALUES(testimonial),
         delivered_at = VALUES(delivered_at)`,
      [
        winner.giveaway_id,
        input.delivery_status,
        input.contact_notes || null,
        input.evidence_image_url || null,
        input.spei_receipt_url || null,
        input.testimonial || null,
        deliveredAt,
      ]
    );

    const updated = await getWinnerDetail(giveawayUuid);
    if (!updated) {
      throw new Error('No se pudo recuperar el ganador actualizado.');
    }
    return updated;
  } catch (error) {
    logger.db.error('Error al actualizar entrega de premio de ganador:', error);
    throw error;
  }
}
