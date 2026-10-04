import { AdminOrder, DashboardAlert, DashboardMetrics, DashboardStatsResponse } from '../types/order.types.js';
import { logger } from './logger.service.js';
import { pool } from '../config/database.config.js';
import { RowDataPacket } from 'mysql2/promise';

interface OrderRow extends RowDataPacket {
  bank_reference: string | null;
  concept_reference: string;
  created_at: Date | string;
  currency: string;
  customer_name: string;
  customer_phone: string;
  expires_at: Date | string;
  giveaway_id: number;
  giveaway_slug: string;
  giveaway_title: string;
  giveaway_uuid: string;
  id: number;
  is_winner: number;
  receipt_filename: string | null;
  receipt_url: string | null;
  status: any;
  ticket_count: number;
  ticket_numbers: string | number[];
  total_amount: number;
  tracking_key: string | null;
  updated_at: Date | string;
  uuid: string;
}

export async function getDashboardStats(): Promise<DashboardStatsResponse> {
  try {
    const [revMxnRows] = await pool.query<RowDataPacket[]>(
      `SELECT COALESCE(SUM(total_amount), 0) AS revenue FROM orders WHERE status = 'completed' AND currency = 'MXN'`
    );
    const [revUsdRows] = await pool.query<RowDataPacket[]>(
      `SELECT COALESCE(SUM(total_amount), 0) AS revenue FROM orders WHERE status = 'completed' AND currency = 'USD'`
    );
    const [ticketsRows] = await pool.query<RowDataPacket[]>(
      `SELECT COUNT(*) AS sold FROM giveaway_tickets WHERE status = 'paid'`
    );
    const [giveawaysRows] = await pool.query<RowDataPacket[]>(
      `SELECT COUNT(*) AS active FROM giveaways WHERE status = 'active'`
    );
    const [reviewRows] = await pool.query<RowDataPacket[]>(
      `SELECT COUNT(*) AS in_review FROM orders WHERE status = 'in_review'`
    );

    const metrics: DashboardMetrics = {
      active_giveaways_count: Number(giveawaysRows[0]?.active || 0),
      in_review_orders_count: Number(reviewRows[0]?.in_review || 0),
      total_revenue_mxn: Number(revMxnRows[0]?.revenue || 0),
      total_revenue_usd: Number(revUsdRows[0]?.revenue || 0),
      total_tickets_sold: Number(ticketsRows[0]?.sold || 0),
    };

    const alerts: DashboardAlert[] = [];

    const [thresholdGiveaways] = await pool.query<RowDataPacket[]>(
      `SELECT uuid, title, min_threshold_pct, countdown_hours, threshold_reached_at, end_date
       FROM giveaways
       WHERE status = 'active' AND threshold_reached_at IS NOT NULL
       ORDER BY end_date ASC`
    );

    for (const g of thresholdGiveaways) {
      alerts.push({
        countdown_hours: Number(g.countdown_hours),
        end_date: new Date(g.end_date).toISOString(),
        giveaway_title: g.title,
        giveaway_uuid: g.uuid,
        id: `threshold-${g.uuid}`,
        message: `El sorteo "${g.title}" alcanzó el umbral mínimo (${g.min_threshold_pct}%). Cronómetro final de ${g.countdown_hours}h activo.`,
        severity: 'critical',
        threshold_pct: Number(g.min_threshold_pct),
        type: 'threshold_countdown',
      });
    }

    const [closingSoonGiveaways] = await pool.query<RowDataPacket[]>(
      `SELECT uuid, title, end_date
       FROM giveaways
       WHERE status = 'active' AND threshold_reached_at IS NULL AND end_date <= DATE_ADD(NOW(), INTERVAL 48 HOUR)
       ORDER BY end_date ASC
       LIMIT 5`
    );

    for (const g of closingSoonGiveaways) {
      alerts.push({
        end_date: new Date(g.end_date).toISOString(),
        giveaway_title: g.title,
        giveaway_uuid: g.uuid,
        id: `closing-${g.uuid}`,
        message: `El sorteo "${g.title}" finaliza en menos de 48 horas.`,
        severity: 'warning',
        type: 'giveaway_closing',
      });
    }

    const [oldReviewsRows] = await pool.query<RowDataPacket[]>(
      `SELECT COUNT(*) AS old_count
       FROM orders
       WHERE status = 'in_review' AND updated_at <= DATE_SUB(NOW(), INTERVAL 1 HOUR)`
    );

    const oldReviewCount = Number(oldReviewsRows[0]?.old_count || 0);
    if (oldReviewCount > 0) {
      alerts.push({
        id: 'pending-reviews-delay',
        message: `Hay ${oldReviewCount} pago(s) en revisión que superan 1 hora de espera para validación.`,
        severity: 'warning',
        type: 'pending_reviews',
      });
    }

    const [recentRows] = await pool.query<OrderRow[]>(
      `SELECT o.id, o.uuid, o.giveaway_id, o.customer_name, o.customer_phone,
              o.ticket_count, o.ticket_numbers,
              CAST(o.total_amount AS DOUBLE) AS total_amount,
              o.currency, o.concept_reference, o.status, o.expires_at,
              o.receipt_url, o.receipt_filename, o.tracking_key, o.bank_reference, o.is_winner,
              o.created_at, o.updated_at,
              g.title AS giveaway_title, g.uuid AS giveaway_uuid, g.slug AS giveaway_slug
       FROM orders o
       INNER JOIN giveaways g ON o.giveaway_id = g.id
       ORDER BY o.created_at DESC
       LIMIT 8`
    );

    const recent_orders: AdminOrder[] = recentRows.map((r) => ({
      bank_reference: r.bank_reference,
      concept_reference: r.concept_reference,
      created_at: new Date(r.created_at).toISOString(),
      currency: r.currency,
      customer_name: r.customer_name,
      customer_phone: r.customer_phone,
      expires_at: new Date(r.expires_at).toISOString(),
      giveaway_id: Number(r.giveaway_id),
      giveaway_slug: r.giveaway_slug,
      giveaway_title: r.giveaway_title,
      giveaway_uuid: r.giveaway_uuid,
      id: Number(r.id),
      is_winner: Number(r.is_winner || 0),
      receipt_filename: r.receipt_filename,
      receipt_url: r.receipt_url,
      status: r.status,
      ticket_count: Number(r.ticket_count),
      ticket_numbers: typeof r.ticket_numbers === 'string' ? JSON.parse(r.ticket_numbers) : r.ticket_numbers,
      total_amount: Number(r.total_amount),
      tracking_key: r.tracking_key,
      updated_at: new Date(r.updated_at).toISOString(),
      uuid: r.uuid,
    }));

    return { alerts, metrics, recent_orders };
  } catch (error) {
    logger.db.error('Error al compilar métricas del dashboard en backend admin', error);
    throw new Error('Error al obtener estadísticas del dashboard.');
  }
}
