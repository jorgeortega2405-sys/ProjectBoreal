import { pool } from '../config/database.config.js';
import { acquireDistributedLock, deleteCache, getCache, publishGiveawayEvent, releaseDistributedLock, setCache } from '../config/redis.config.js';
import { DailyGiveawayWinnerItem, Giveaway } from '../types/giveaway.types.js';
import { logger } from './logger.service.js';
import crypto from 'crypto';
import { RowDataPacket } from 'mysql2/promise';

interface GiveawayRow extends RowDataPacket, Giveaway {}

export function calculateDailyCycleDates(now: Date = new Date()): { endDate: Date; hours: number; startDate: Date } {
  const current = new Date(now);
  const dayOfWeek = current.getDay();

  const targetEnd = new Date(current);
  targetEnd.setHours(23, 59, 59, 999);

  if (dayOfWeek === 5) {
    if (current.getTime() >= targetEnd.getTime()) {
      targetEnd.setDate(targetEnd.getDate() + 3);
    }
  } else if (dayOfWeek === 6) {
    targetEnd.setDate(targetEnd.getDate() + 2);
  } else if (dayOfWeek === 0) {
    targetEnd.setDate(targetEnd.getDate() + 1);
  } else {
    if (current.getTime() >= targetEnd.getTime()) {
      targetEnd.setDate(targetEnd.getDate() + 1);
    }
  }

  const startDate = new Date(current);
  const diffHours = Math.max(1, Math.round((targetEnd.getTime() - startDate.getTime()) / (3600 * 1000)));

  return {
    endDate: targetEnd,
    hours: diffHours,
    startDate,
  };
}

export async function getCurrentDailyGiveaway(): Promise<Giveaway | null> {
  try {
    const cacheKey = 'giveaway:daily:current';
    const cached = await getCache<Giveaway>(cacheKey);
    if (cached) return cached;

    const [rows] = await pool.query<GiveawayRow[]>(
      `SELECT id, uuid, title, slug, description, primary_image_url, image_urls, package_options,
              CAST(ticket_price AS DOUBLE) AS ticket_price,
              total_tickets, available_tickets, currency, type, status,
              start_date, end_date, min_threshold_pct, countdown_hours, threshold_reached_at,
              winner_ticket_number, winner_name, winner_order_id, winner_announced_at,
              prize_amount, draw_date, created_at, updated_at
       FROM giveaways
       WHERE type = 'daily'
         AND status = 'active'
         AND end_date > NOW()
       ORDER BY end_date ASC
       LIMIT 1`
    );

    if (rows.length > 0) {
      const row = rows[0];
      const [countRows] = await pool.query<RowDataPacket[]>(
        `SELECT COUNT(*) AS paid_count FROM giveaway_tickets WHERE giveaway_id = ? AND status = 'paid'`,
        [row.id]
      );
      const paidCount = Number(countRows[0]?.paid_count || 0);
      const currentPot = Math.round(paidCount * (Number(row.ticket_price) * 0.50));

      const giveaway: Giveaway = {
        ...row,
        current_pot: currentPot,
        image_urls: typeof row.image_urls === 'string' ? JSON.parse(row.image_urls) : row.image_urls,
        package_options: row.package_options
          ? (typeof row.package_options === 'string' ? JSON.parse(row.package_options) : row.package_options)
          : [5, 10, 25, 50, 100],
      };
      await setCache(cacheKey, giveaway, 10);
      return giveaway;
    }

    return await ensureCurrentDailyGiveaway();
  } catch (error) {
    logger.db.error('Error al obtener sorteo diario activo en MySQL', error);
    return null;
  }
}

export async function isDailyGiveawayPaused(): Promise<boolean> {
  try {
    const cached = await getCache<string>('boreal:settings:daily_giveaway_paused_next');
    if (cached !== null && cached !== undefined) {
      return cached === '1' || cached === 'true';
    }
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT setting_value FROM system_settings WHERE setting_key = 'daily_giveaway_paused_next' LIMIT 1`
    );
    if (rows.length > 0) {
      const val = String(rows[0].setting_value);
      const isPaused = val === '1' || val === 'true';
      await setCache('boreal:settings:daily_giveaway_paused_next', isPaused ? '1' : '0', 60);
      return isPaused;
    }
    return false;
  } catch (error) {
    logger.db.warn('Error al consultar setting daily_giveaway_paused_next en MySQL/Redis', error);
    return false;
  }
}

export async function ensureCurrentDailyGiveaway(): Promise<Giveaway | null> {
  const lockToken = crypto.randomUUID();
  const hasLock = await acquireDistributedLock('ensure_daily_giveaway', 10, lockToken);

  try {
    const [existing] = await pool.query<GiveawayRow[]>(
      `SELECT id, uuid, title, slug, description, primary_image_url, image_urls, package_options,
              CAST(ticket_price AS DOUBLE) AS ticket_price,
              total_tickets, available_tickets, currency, type, status,
              start_date, end_date, min_threshold_pct, countdown_hours, threshold_reached_at,
              winner_ticket_number, winner_name, winner_order_id, winner_announced_at,
              prize_amount, draw_date, created_at, updated_at
       FROM giveaways
       WHERE type = 'daily'
         AND status = 'active'
         AND end_date > NOW()
       ORDER BY end_date ASC
       LIMIT 1`
    );

    if (existing.length > 0) {
      const row = existing[0];
      const [countRows] = await pool.query<RowDataPacket[]>(
        `SELECT COUNT(*) AS paid_count FROM giveaway_tickets WHERE giveaway_id = ? AND status = 'paid'`,
        [row.id]
      );
      const paidCount = Number(countRows[0]?.paid_count || 0);
      const currentPot = Math.round(paidCount * (Number(row.ticket_price) * 0.50));

      const result: Giveaway = {
        ...row,
        current_pot: currentPot,
        image_urls: typeof row.image_urls === 'string' ? JSON.parse(row.image_urls) : row.image_urls,
        package_options: row.package_options
          ? (typeof row.package_options === 'string' ? JSON.parse(row.package_options) : row.package_options)
          : [5, 10, 25, 50, 100],
      };
      await setCache('giveaway:daily:current', result, 10);
      return result;
    }

    if (await isDailyGiveawayPaused()) {
      logger.app.info('Aprovisionamiento de nuevo sorteo diario omitido: renovación automática en pausa.');
      return null;
    }

    const { endDate, hours, startDate } = calculateDailyCycleDates();
    const endIso = endDate.toISOString().slice(0, 10);
    const dayStr = String(endDate.getDate()).padStart(2, '0');
    const monthStr = String(endDate.getMonth() + 1).padStart(2, '0');
    const yearStr = endDate.getFullYear();

    const baseSlug = `sorteo-diario-${endIso}`;
    let finalSlug = baseSlug;

    const [slugCheck] = await pool.query<RowDataPacket[]>(
      `SELECT id FROM giveaways WHERE slug = ? LIMIT 1`,
      [finalSlug]
    );
    if (slugCheck.length > 0) {
      finalSlug = `${baseSlug}-${crypto.randomBytes(2).toString('hex')}`;
    }

    const uuid = crypto.randomUUID();
    const title = `Sorteo Diario (${dayStr}/${monthStr}/${yearStr})`;
    const description =
      '¡Sorteo diario de lunes a viernes! 20,000 boletos disponibles a solo $2 MXN cada uno. El ganador se lleva una parte del acumulado en efectivo al finalizar el día.';
    const primaryImageUrl = '/images/giveaways/daily/daily-cash-1000-main.jpg';
    const imageUrls = JSON.stringify([
      '/images/giveaways/daily/daily-cash-1000-main.jpg',
    ]);
    const packageOptions = JSON.stringify([5, 10, 25, 50, 100]);

    await pool.query(
      `INSERT INTO giveaways (
        uuid, title, slug, description, primary_image_url, image_urls, package_options,
        ticket_price, total_tickets, available_tickets, currency, type, status,
        start_date, end_date, draw_date, min_threshold_pct, countdown_hours
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 2.00, 20000, 20000, 'MXN', 'daily', 'active', ?, ?, ?, 0, ?)`,
      [
        uuid,
        title,
        finalSlug,
        description,
        primaryImageUrl,
        imageUrls,
        packageOptions,
        startDate,
        endDate,
        endDate,
        hours,
      ]
    );

    const [createdRows] = await pool.query<GiveawayRow[]>(
      `SELECT id, uuid, title, slug, description, primary_image_url, image_urls, package_options,
              CAST(ticket_price AS DOUBLE) AS ticket_price,
              total_tickets, available_tickets, currency, type, status,
              start_date, end_date, min_threshold_pct, countdown_hours, threshold_reached_at,
              winner_ticket_number, winner_name, winner_order_id, winner_announced_at,
              prize_amount, draw_date, created_at, updated_at
       FROM giveaways
       WHERE uuid = ?
       LIMIT 1`,
      [uuid]
    );

    if (createdRows.length === 0) return null;

    const row = createdRows[0];

    await pool.query(
      `INSERT INTO giveaway_bank_accounts (giveaway_id, bank_account_id, is_active)
       SELECT ?, id, 1 FROM bank_accounts WHERE is_active = 1
       ON DUPLICATE KEY UPDATE is_active = 1`,
      [row.id]
    );

    const ticketBatchSize = 2000;
    const totalDailyTickets = 20000;
    for (let i = 1; i <= totalDailyTickets; i += ticketBatchSize) {
      const batchValues: [number, number, string][] = [];
      const end = Math.min(i + ticketBatchSize - 1, totalDailyTickets);
      for (let num = i; num <= end; num++) {
        batchValues.push([row.id, num, 'available']);
      }
      await pool.query(
        `INSERT IGNORE INTO giveaway_tickets (giveaway_id, ticket_number, status) VALUES ?`,
        [batchValues]
      );
    }

    const newGiveaway: Giveaway = {
      ...row,
      current_pot: 0,
      image_urls: typeof row.image_urls === 'string' ? JSON.parse(row.image_urls) : row.image_urls,
      package_options: [5, 10, 25, 50, 100],
    };

    await deleteCache('giveaway:daily:current');
    await deleteCache('giveaways:active');
    await setCache('giveaway:daily:current', newGiveaway, 10);

    logger.app.info(
      `Sorteo diario aprovisionado exitosamente: '${title}' (UUID: ${uuid}, Cierre: ${endDate.toISOString()})`
    );

    await publishGiveawayEvent('boreal:giveaways', {
      giveaway_title: newGiveaway.title,
      giveaway_uuid: newGiveaway.uuid,
      type: 'DAILY_GIVEAWAY_CYCLE_UPDATED',
    });

    return newGiveaway;
  } catch (error) {
    logger.db.error('Error al aprovisionar sorteo diario en MySQL', error);
    return null;
  } finally {
    if (hasLock) {
      await releaseDistributedLock('ensure_daily_giveaway', lockToken);
    }
  }
}

export async function getRecentDailyWinners(limit = 5): Promise<DailyGiveawayWinnerItem[]> {
  try {
    const cacheKey = `giveaway:daily:recent_winners:${limit}`;
    const cached = await getCache<DailyGiveawayWinnerItem[]>(cacheKey);
    if (cached) return cached;

    interface DailyWinnerRow extends RowDataPacket {
      customer_phone: string | null;
      customer_state: string | null;
      draw_date: string | null;
      end_date: string;
      prize_amount: number | null;
      title: string;
      uuid: string;
      winner_announced_at: string | null;
      winner_name: string | null;
      winner_ticket_number: number | null;
    }

    const [rows] = await pool.query<DailyWinnerRow[]>(
      `SELECT g.uuid, g.title, g.draw_date, g.end_date, g.winner_announced_at,
              g.winner_name, g.winner_ticket_number,
              COALESCE(g.prize_amount, 0) AS prize_amount,
              o.customer_state, o.customer_phone
       FROM giveaways g
       LEFT JOIN orders o ON g.winner_order_id = o.id
       WHERE g.type = 'daily'
         AND g.status = 'completed'
         AND g.winner_ticket_number IS NOT NULL
       ORDER BY COALESCE(g.winner_announced_at, g.end_date) DESC
       LIMIT ?`,
      [limit]
    );

    const list: DailyGiveawayWinnerItem[] = rows.map((r) => {
      let rawName = r.winner_name || 'Participante';
      let state = r.customer_state || null;

      const parenMatch = rawName.match(/\(([^)]+)\)/);
      if (parenMatch) {
        if (!state) {
          state = parenMatch[1].trim();
        }
        rawName = rawName.replace(/\s*\([^)]*\)\s*/, '').trim();
      }

      if (!state) {
        state = 'México';
      }

      let maskedPhone: string;
      if (r.customer_phone) {
        const digits = r.customer_phone.replace(/\D/g, '');
        const lastTwo = digits.length >= 2 ? digits.slice(-2) : '••';
        maskedPhone = `+52 •• •• •• ${lastTwo}`;
      } else {
        maskedPhone = '+52 •• •• •• ••';
      }

      return {
        country: 'México',
        customer_city: state,
        customer_phone_masked: maskedPhone,
        customer_state: state,
        draw_date: r.draw_date || r.end_date,
        prize_amount: Number(r.prize_amount || 0),
        title: r.title,
        uuid: r.uuid,
        winner_announced_at: r.winner_announced_at,
        winner_name: rawName,
        winner_ticket_number: r.winner_ticket_number,
      };
    });

    await setCache(cacheKey, list, 30);
    return list;
  } catch (error) {
    logger.db.error('Error al consultar últimos ganadores del sorteo diario en MySQL', error);
    return [];
  }
}
