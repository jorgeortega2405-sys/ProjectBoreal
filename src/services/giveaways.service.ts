import crypto from 'crypto';
import { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { pool } from '../config/database.config.js';
import { deleteCache, getCache, publishGiveawayEvent, setCache } from '../config/redis.config.js';
import { Giveaway, WinnerGiveawayItem } from '../types/giveaway.types.js';
import { ensureCurrentDailyGiveaway } from './daily-giveaway.service.js';
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
      `SELECT id, uuid, title, slug, description, primary_image_url, image_urls, package_options,
              CAST(ticket_price AS DOUBLE) AS ticket_price,
              total_tickets, available_tickets, currency, type, status,
              start_date, end_date, min_threshold_pct, countdown_hours, threshold_reached_at,
              winner_ticket_number, winner_name, winner_order_id, winner_announced_at,
              draw_date, created_at, updated_at
       FROM giveaways
       WHERE (status = 'active' OR (status = 'completed' AND type != 'daily' AND end_date >= DATE_SUB(NOW(), INTERVAL 24 HOUR)))
       ORDER BY 
          CASE 
            WHEN type = 'daily' AND status = 'active' THEN -1
            WHEN status = 'active' AND (start_date IS NULL OR start_date <= NOW()) THEN 0
            WHEN status = 'active' AND start_date > NOW() THEN 1
            ELSE 2 
          END ASC,
          CASE 
            WHEN status = 'active' AND (start_date IS NULL OR start_date <= NOW()) AND threshold_reached_at IS NOT NULL THEN end_date
            ELSE NULL
          END ASC,
          CASE 
            WHEN status = 'active' AND start_date > NOW() THEN start_date
            ELSE NULL
          END ASC,
          end_date ASC`
    );

    const list = await Promise.all(
      rows.map(async (row) => {
        let currentPot: number | undefined;
        if (row.type === 'daily') {
          const [countRows] = await pool.query<RowDataPacket[]>(
            `SELECT COUNT(*) AS paid_count FROM giveaway_tickets WHERE giveaway_id = ? AND status = 'paid'`,
            [row.id]
          );
          const paidCount = Number(countRows[0]?.paid_count || 0);
          currentPot = Math.round(paidCount * (Number(row.ticket_price) * 0.50));
        }

        return {
          ...row,
          current_pot: currentPot,
          image_urls: typeof row.image_urls === 'string' ? JSON.parse(row.image_urls) : row.image_urls,
          package_options: row.package_options
            ? (typeof row.package_options === 'string' ? JSON.parse(row.package_options) : row.package_options)
            : (row.type === 'daily' ? [5, 10, 25, 50, 100] : [1, 3, 5, 10, 20]),
        };
      })
    );

    await setCache('giveaways:active', list, 30);
    return list;
  } catch (error) {
    logger.db.error('Error al consultar sorteos activos en MySQL', error);
    throw new Error('Error al obtener los sorteos activos');
  }
}

export async function getCompletedGiveawaysWithWinners(): Promise<WinnerGiveawayItem[]> {
  try {
    const cached = await getCache<WinnerGiveawayItem[]>('giveaways:winners');
    if (cached) return cached;

    interface WinnerRow extends RowDataPacket {
      currency: string;
      customer_state: string | null;
      draw_date: string | null;
      end_date: string;
      image_urls: string | string[] | null;
      primary_image_url: string;
      slug: string;
      ticket_price: number;
      title: string;
      total_tickets: number;
      uuid: string;
      winner_announced_at: string | null;
      winner_name: string | null;
      winner_ticket_number: number | null;
    }

    const [rows] = await pool.query<WinnerRow[]>(
      `SELECT g.uuid, g.title, g.slug, g.primary_image_url, g.image_urls,
              CAST(g.ticket_price AS DOUBLE) AS ticket_price,
              g.total_tickets, g.currency, g.draw_date, g.end_date,
              g.winner_ticket_number, g.winner_name, g.winner_announced_at,
              o.customer_state
       FROM giveaways g
       LEFT JOIN orders o ON g.winner_order_id = o.id
       WHERE g.status = 'completed' AND g.winner_ticket_number IS NOT NULL
       ORDER BY COALESCE(g.winner_announced_at, g.end_date) DESC`
    );

    const list: WinnerGiveawayItem[] = rows.map((row) => ({
      currency: row.currency,
      customer_state: row.customer_state,
      draw_date: row.draw_date,
      end_date: row.end_date,
      image_urls: typeof row.image_urls === 'string' ? JSON.parse(row.image_urls) : row.image_urls,
      primary_image_url: row.primary_image_url,
      slug: row.slug,
      ticket_price: row.ticket_price,
      title: row.title,
      total_tickets: row.total_tickets,
      uuid: row.uuid,
      winner_announced_at: row.winner_announced_at,
      winner_name: row.winner_name,
      winner_ticket_number: row.winner_ticket_number,
    }));

    await setCache('giveaways:winners', list, 300);
    return list;
  } catch (error) {
    logger.db.error('Error al consultar ganadores en MySQL', error);
    throw new Error('Error al obtener los ganadores de sorteos');
  }
}

export async function getGiveawayByUuid(uuid: string): Promise<Giveaway | null> {
  try {
    const cacheKey = `giveaway:${uuid}`;
    const cached = await getCache<Giveaway>(cacheKey);
    if (cached) return cached;

    const [rows] = await pool.query<GiveawayRow[]>(
      `SELECT id, uuid, title, slug, description, primary_image_url, image_urls, package_options,
              CAST(ticket_price AS DOUBLE) AS ticket_price,
              total_tickets, available_tickets, currency, type, status,
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
      package_options: row.package_options
        ? (typeof row.package_options === 'string' ? JSON.parse(row.package_options) : row.package_options)
        : [1, 3, 5, 10, 20],
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
    const [giveaways] = await clientOrPool.query<RowDataPacket[]>(
      `SELECT id, uuid, total_tickets, min_threshold_pct, countdown_hours, threshold_reached_at
       FROM giveaways
       WHERE id = ?
       LIMIT 1`,
      [giveawayId]
    );

    if (!giveaways.length) return { triggered: false };
    const row = giveaways[0];

    if (row.min_threshold_pct > 0 && !row.threshold_reached_at) {
      const [countRows] = await clientOrPool.query<RowDataPacket[]>(
        `SELECT COUNT(*) AS paid_count
         FROM giveaway_tickets
         WHERE giveaway_id = ? AND status = 'paid'`,
        [giveawayId]
      );

      const totalTickets = Number(row.total_tickets || 100);
      const paidCount = Number(countRows[0]?.paid_count || 0);
      const pctSold = (paidCount / totalTickets) * 100;

      if (pctSold >= row.min_threshold_pct) {
        const countdownHours = Number(row.countdown_hours || 72);
        const computedEndDate = new Date(Date.now() + countdownHours * 3600 * 1000);

        const [updateRes] = await clientOrPool.query<ResultSetHeader>(
          `UPDATE giveaways
           SET threshold_reached_at = NOW(),
               end_date = ?
           WHERE id = ? AND threshold_reached_at IS NULL`,
          [computedEndDate, giveawayId]
        );

        if (updateRes.affectedRows > 0) {
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
      `SELECT id, uuid, title, end_date, type
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

        const [countRows] = await connection.query<RowDataPacket[]>(
          `SELECT COUNT(*) AS total_paid
           FROM giveaway_tickets 
           WHERE giveaway_id = ? AND status = 'paid'`,
          [giveaway.id]
        );

        const totalPaid = Number(countRows[0]?.total_paid || 0);
        let winnerTicketNumber: number | null = null;
        let winnerName = 'Sin participantes';
        let winnerOrderId: number | null = null;

        if (totalPaid > 0) {
          const randomIndex = crypto.randomInt(0, totalPaid);
          const [chosenRows] = await connection.query<RowDataPacket[]>(
            `SELECT ticket_number, order_id 
             FROM giveaway_tickets 
             WHERE giveaway_id = ? AND status = 'paid'
             ORDER BY id ASC
             LIMIT 1 OFFSET ?
             FOR UPDATE`,
            [giveaway.id, randomIndex]
          );

          if (chosenRows.length > 0) {
            const chosen = chosenRows[0];
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
        }

        const prizeAmount = giveaway.type === 'daily'
          ? Math.round(totalPaid * (Number(giveaway.ticket_price) * 0.50))
          : null;

        await connection.query(
          `UPDATE giveaways 
           SET status = 'completed',
               winner_ticket_number = ?,
               winner_name = ?,
               winner_order_id = ?,
               winner_announced_at = NOW(),
               prize_amount = ?
           WHERE id = ?`,
          [winnerTicketNumber, winnerName, winnerOrderId, prizeAmount, giveaway.id]
        );

        await connection.commit();
        connection.release();
        connection = undefined;

        await deleteCache('giveaways:active');
        await deleteCache(`giveaway:${giveaway.uuid}`);
        await deleteCache(`giveaway:${giveaway.uuid}:tickets`);
        await deleteCache('giveaways:winners');

        if (giveaway.type === 'daily') {
          await deleteCache('giveaway:daily:current');
          await deleteCache('giveaway:daily:recent_winners:5');
          await ensureCurrentDailyGiveaway();
        }

        logger.app.info(
          `Sorteo concluido exitosamente para '${giveaway.title}' (ID: ${giveaway.id}). Ganador: ${winnerName}, Boleto: #${winnerTicketNumber ?? 'N/A'}`
        );

        await publishGiveawayEvent('boreal:giveaways', {
          giveaway_title: giveaway.title,
          giveaway_uuid: giveaway.uuid,
          prize_amount: prizeAmount,
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
