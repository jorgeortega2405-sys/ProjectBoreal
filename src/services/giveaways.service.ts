import crypto from 'crypto';
import { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise';
import { pool } from '../config/database.config.js';
import { deleteCache, getCache, publishGiveawayEvent, setCache } from '../config/redis.config.js';
import { Giveaway } from '../types/giveaway.types.js';
import { logger } from './logger.service.js';

interface GiveawayRow extends RowDataPacket, Giveaway {}

export interface GiveawayTicketsStatus {
  paid: number[];
  reserved: number[];
  total: number;
}

export async function getActiveGiveaways(): Promise<Giveaway[]> {
  try {
    const cached = await getCache<Giveaway[]>('giveaways:active');
    if (cached) return cached;

    const [rows] = await pool.query<GiveawayRow[]>(
      `SELECT id, uuid, title, slug, description, primary_image_url, image_urls,
              CAST(ticket_price AS DOUBLE) AS ticket_price,
              total_tickets, available_tickets, currency, status,
              start_date, end_date, min_threshold_pct, countdown_hours, threshold_reached_at,
              winner_ticket_number, winner_name, winner_order_id, winner_announced_at,
              draw_date, created_at, updated_at
       FROM giveaways
       WHERE status = 'active' 
          OR (status = 'completed' AND end_date >= DATE_SUB(NOW(), INTERVAL 24 HOUR))
       ORDER BY 
          CASE WHEN status = 'active' THEN 0 ELSE 1 END,
          end_date ASC`
    );

    const list = rows.map((row) => ({
      ...row,
      image_urls: typeof row.image_urls === 'string' ? JSON.parse(row.image_urls) : row.image_urls,
    }));

    await setCache('giveaways:active', list, 30);
    return list;
  } catch (error) {
    logger.db.error('Error al consultar sorteos activos en MySQL', error);
    throw new Error('Error al obtener los sorteos activos');
  }
}

export async function getGiveawayByUuid(uuid: string): Promise<Giveaway | null> {
  try {
    const cacheKey = `giveaway:${uuid}`;
    const cached = await getCache<Giveaway>(cacheKey);
    if (cached) return cached;

    const [rows] = await pool.query<GiveawayRow[]>(
      `SELECT id, uuid, title, slug, description, primary_image_url, image_urls,
              CAST(ticket_price AS DOUBLE) AS ticket_price,
              total_tickets, available_tickets, currency, status,
              start_date, end_date, min_threshold_pct, countdown_hours, threshold_reached_at,
              winner_ticket_number, winner_name, winner_order_id, winner_announced_at,
              draw_date, created_at, updated_at
       FROM giveaways
       WHERE uuid = ?
       LIMIT 1`,
      [uuid]
    );

    if (rows.length === 0) return null;
    const row = rows[0];
    const result = {
      ...row,
      image_urls: typeof row.image_urls === 'string' ? JSON.parse(row.image_urls) : row.image_urls,
    };

    await setCache(cacheKey, result, 60);
    return result;
  } catch (error) {
    logger.db.error('Error al consultar sorteo por UUID en MySQL', error);
    throw new Error('Error al obtener el sorteo solicitado');
  }
}

export async function getGiveawayTakenTickets(uuid: string): Promise<GiveawayTicketsStatus | null> {
  try {
    const cacheKey = `giveaway:${uuid}:tickets`;
    const cached = await getCache<GiveawayTicketsStatus>(cacheKey);
    if (cached) return cached;

    const giveaway = await getGiveawayByUuid(uuid);
    if (!giveaway) return null;

    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT t.ticket_number, t.status, t.reserved_until
       FROM giveaway_tickets t
       WHERE t.giveaway_id = ?
         AND (t.status = 'paid' OR (t.status = 'reserved' AND t.reserved_until > NOW()))`,
      [giveaway.id]
    );

    const paid: number[] = [];
    const reserved: number[] = [];

    for (const r of rows) {
      if (r.status === 'paid') {
        paid.push(r.ticket_number);
      } else if (r.status === 'reserved') {
        reserved.push(r.ticket_number);
      }
    }

    const result: GiveawayTicketsStatus = {
      paid,
      reserved,
      total: giveaway.total_tickets,
    };

    await setCache(cacheKey, result, 10);
    return result;
  } catch (error) {
    logger.db.error('Error al consultar boletos ocupados de sorteo en MySQL', error);
    throw new Error('Error al consultar estado de boletos');
  }
}

export async function checkAndTriggerGiveawayThreshold(
  giveawayId: number,
  clientOrPool: Pool | PoolConnection = pool
): Promise<{ countdownHours?: number; endDate?: string; giveawayUuid?: string; triggered: boolean }> {
  try {
    const [rows] = await clientOrPool.query<RowDataPacket[]>(
      `SELECT g.id, g.uuid, g.total_tickets, g.available_tickets, g.min_threshold_pct, g.countdown_hours, g.threshold_reached_at,
              COUNT(gt.id) AS paid_count
       FROM giveaways g
       LEFT JOIN giveaway_tickets gt ON gt.giveaway_id = g.id AND gt.status = 'paid'
       WHERE g.id = ?
       GROUP BY g.id`,
      [giveawayId]
    );

    if (!rows.length) return { triggered: false };
    const row = rows[0];

    if (row.min_threshold_pct > 0 && !row.threshold_reached_at) {
      const totalTickets = Number(row.total_tickets || 100);
      const paidCount = Number(row.paid_count || 0);
      const pctSold = (paidCount / totalTickets) * 100;

      if (pctSold >= row.min_threshold_pct) {
        const countdownHours = Number(row.countdown_hours || 48);
        const computedEndDate = new Date(Date.now() + countdownHours * 3600 * 1000);

        await clientOrPool.query(
          `UPDATE giveaways
           SET threshold_reached_at = NOW(),
               end_date = ?
           WHERE id = ? AND threshold_reached_at IS NULL`,
          [computedEndDate, giveawayId]
        );

        await deleteCache(`giveaway:${row.uuid}`);
        await deleteCache('giveaways:active');

        await publishGiveawayEvent('boreal:giveaways', {
          countdown_hours: countdownHours,
          end_date: computedEndDate.toISOString(),
          giveaway_uuid: row.uuid,
          threshold_reached_at: new Date().toISOString(),
          type: 'GIVEAWAY_THRESHOLD_REACHED',
        });

        logger.app.info(
          `Umbral alcanzado para sorteo ${row.uuid} (${pctSold.toFixed(1)}% >= ${row.min_threshold_pct}%). Cronómetro de ${countdownHours}h activado.`
        );

        return {
          countdownHours,
          endDate: computedEndDate.toISOString(),
          giveawayUuid: row.uuid,
          triggered: true,
        };
      }
    }

    return { triggered: false };
  } catch (error) {
    logger.db.error('Error al evaluar umbral del sorteo', error);
    return { triggered: false };
  }
}

export async function drawGiveawayWinners(): Promise<void> {
  let connection;
  try {
    const [giveawaysToDraw] = await pool.query<GiveawayRow[]>(
      `SELECT id, uuid, title, end_date
       FROM giveaways
       WHERE status = 'active'
         AND (min_threshold_pct = 0 OR threshold_reached_at IS NOT NULL)
         AND end_date <= NOW()`
    );

    if (giveawaysToDraw.length === 0) {
      return;
    }

    for (const giveaway of giveawaysToDraw) {
      connection = await pool.getConnection();
      await connection.beginTransaction();

      try {
        const [lockedGiveaways] = await connection.query<GiveawayRow[]>(
          `SELECT id, status, min_threshold_pct, threshold_reached_at FROM giveaways WHERE id = ? FOR UPDATE`,
          [giveaway.id]
        );

        if (
          !lockedGiveaways.length ||
          lockedGiveaways[0].status !== 'active' ||
          (lockedGiveaways[0].min_threshold_pct > 0 && !lockedGiveaways[0].threshold_reached_at)
        ) {
          await connection.rollback();
          connection.release();
          continue;
        }

        const [paidTickets] = await connection.query<RowDataPacket[]>(
          `SELECT ticket_number, order_id 
           FROM giveaway_tickets 
           WHERE giveaway_id = ? AND status = 'paid'
           FOR UPDATE`,
          [giveaway.id]
        );

        let winnerTicketNumber: number | null = null;
        let winnerName = 'Sin participantes';
        let winnerOrderId: number | null = null;

        if (paidTickets.length > 0) {
          const randomIndex = crypto.randomInt(0, paidTickets.length);
          const chosen = paidTickets[randomIndex];
          winnerTicketNumber = chosen.ticket_number;
          winnerOrderId = chosen.order_id;

          if (winnerOrderId) {
            const [orderRows] = await connection.query<RowDataPacket[]>(
              `SELECT customer_name FROM orders WHERE id = ?`,
              [winnerOrderId]
            );
            if (orderRows.length > 0) {
              winnerName = orderRows[0].customer_name;
            }
          }

          await connection.query(
            `UPDATE giveaway_tickets 
             SET is_winner = 1 
             WHERE giveaway_id = ? AND ticket_number = ?`,
            [giveaway.id, winnerTicketNumber]
          );

          if (winnerOrderId) {
            await connection.query(
              `UPDATE orders 
               SET is_winner = 1 
               WHERE id = ?`,
              [winnerOrderId]
            );
          }
        }

        await connection.query(
          `UPDATE giveaways 
           SET status = 'completed',
               winner_ticket_number = ?,
               winner_name = ?,
               winner_order_id = ?,
               winner_announced_at = NOW()
           WHERE id = ?`,
          [winnerTicketNumber, winnerName, winnerOrderId, giveaway.id]
        );

        await connection.commit();
        connection.release();
        connection = undefined;

        await deleteCache('giveaways:active');
        await deleteCache(`giveaway:${giveaway.uuid}`);
        await deleteCache(`giveaway:${giveaway.uuid}:tickets`);

        logger.app.info(
          `Sorteo concluido exitosamente para '${giveaway.title}' (ID: ${giveaway.id}). Ganador: ${winnerName}, Boleto: #${winnerTicketNumber ?? 'N/A'}`
        );

        await publishGiveawayEvent('boreal:giveaways', {
          giveaway_title: giveaway.title,
          giveaway_uuid: giveaway.uuid,
          type: 'GIVEAWAY_WINNER_DRAWN',
          winner_announced_at: new Date().toISOString(),
          winner_name: winnerName,
          winner_ticket_number: winnerTicketNumber,
        });
      } catch (drawErr) {
        if (connection) {
          await connection.rollback();
          connection.release();
          connection = undefined;
        }
        logger.app.error(`Error al procesar sorteo para giveaway ID ${giveaway.id}`, drawErr);
      }
    }
  } catch (err) {
    if (connection) {
      connection.release();
    }
    logger.app.error('Error al evaluar sorteos por finalizar', err);
  }
}
