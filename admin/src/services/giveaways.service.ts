import { pool } from '../config/database.config.js';
import { redis } from '../config/redis.config.js';
import { logger } from './logger.service.js';
import crypto from 'crypto';
import fs from 'fs';
import { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import path from 'path';

export interface AdminGiveawayItem {
  available_tickets: number;
  bank_accounts: Array<{
    account_holder: string;
    account_type: string;
    bank_name: string;
    id: number;
  }>;
  can_pause: boolean;
  countdown_hours: number;
  created_at: string;
  currency: string;
  daily_pause_next_scheduled: boolean;
  description: string | null;
  draw_date: string | null;
  end_date: string;
  id: number;
  image_urls: string[];
  min_threshold_pct: number;
  orders_count: number;
  package_options: number[];
  paid_tickets: number;
  pause_block_reason: string | null;
  primary_image_url: string;
  prize_amount: number | null;
  progress_pct: number;
  reserved_tickets: number;
  revenue_collected: number;
  slug: string;
  start_date: string;
  status: 'draft' | 'active' | 'paused' | 'completed' | 'cancelled';
  threshold_reached_at: string | null;
  ticket_price: number;
  title: string;
  total_tickets: number;
  type: 'standard' | 'daily';
  updated_at: string;
  uuid: string;
  winner_announced_at: string | null;
  winner_name: string | null;
  winner_order_id: number | null;
  winner_ticket_number: number | null;
}

export interface CreateGiveawayInput {
  bank_account_ids?: number[];
  countdown_hours?: number;
  currency?: string;
  description?: string;
  draw_date?: string | null;
  end_date: string;
  image_urls?: string[];
  min_threshold_pct?: number;
  package_options?: number[];
  primary_image_url: string;
  prize_amount?: number | null;
  slug?: string;
  start_date?: string;
  status?: 'draft' | 'active';
  ticket_price: number;
  title: string;
  total_tickets: number;
  type?: 'standard' | 'daily';
}

export interface UpdateGiveawayInput {
  bank_account_ids?: number[];
  countdown_hours?: number;
  currency?: string;
  description?: string;
  draw_date?: string | null;
  end_date?: string;
  image_urls?: string[];
  min_threshold_pct?: number;
  package_options?: number[];
  primary_image_url?: string;
  prize_amount?: number | null;
  slug?: string;
  start_date?: string;
  ticket_price?: number;
  title?: string;
  total_tickets?: number;
}

export interface BankAccountItem {
  account_holder: string;
  account_number: string | null;
  account_type: 'clabe' | 'card' | 'both';
  bank_name: string;
  card_number: string | null;
  clabe: string | null;
  currency: string;
  id: number;
  is_active: number;
  uuid: string;
}

function slugify(text: string): string {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '-')
    .replace(/[^\w-]+/g, '')
    .replace(/--+/g, '-');
}

export async function isDailyGiveawayPauseScheduled(): Promise<boolean> {
  try {
    if (redis && (redis.status === 'ready' || redis.status === 'connect')) {
      const cached = await redis.get('boreal:settings:daily_giveaway_paused_next');
      if (cached !== null) {
        return cached === '1' || cached === 'true';
      }
    }
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT setting_value FROM system_settings WHERE setting_key = 'daily_giveaway_paused_next' LIMIT 1`
    );
    if (rows.length > 0) {
      const isPaused = String(rows[0].setting_value) === '1' || String(rows[0].setting_value) === 'true';
      if (redis && (redis.status === 'ready' || redis.status === 'connect')) {
        await redis.set('boreal:settings:daily_giveaway_paused_next', isPaused ? '1' : '0', 'EX', 60);
      }
      return isPaused;
    }
    return false;
  } catch (error) {
    logger.db.warn('Error al consultar setting daily_giveaway_paused_next en admin:', error);
    return false;
  }
}

export async function setDailyGiveawayPauseScheduled(paused: boolean): Promise<boolean> {
  try {
    const val = paused ? '1' : '0';
    await pool.query(
      `INSERT INTO system_settings (setting_key, setting_value, description)
       VALUES ('daily_giveaway_paused_next', ?, 'Indica si la regeneración automática del sorteo diario está en pausa')
       ON DUPLICATE KEY UPDATE setting_value = ?`,
      [val, val]
    );
    if (redis && (redis.status === 'ready' || redis.status === 'connect')) {
      await redis.set('boreal:settings:daily_giveaway_paused_next', val, 'EX', 86400);
      await redis.del('giveaway:daily:current');
      await redis.del('giveaways:active');
    }
    logger.app.info(`Estado de suspensión para próximo sorteo diario actualizado a: ${paused ? 'PAUSADO' : 'ACTIVO'}`);
    return true;
  } catch (error) {
    logger.db.error('Error al actualizar setting daily_giveaway_paused_next en admin:', error);
    throw new Error('Error al actualizar la configuración del sorteo diario');
  }
}

export async function getDailyGiveawayPotPercentage(): Promise<number> {
  try {
    if (redis && (redis.status === 'ready' || redis.status === 'connect')) {
      const cached = await redis.get('boreal:settings:daily_giveaway_pot_percentage');
      if (cached !== null) {
        const parsed = Number(cached);
        if (!Number.isNaN(parsed) && parsed > 0 && parsed <= 100) {
          return parsed;
        }
      }
    }
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT setting_value FROM system_settings WHERE setting_key = 'daily_giveaway_pot_percentage' LIMIT 1`
    );
    if (rows.length > 0) {
      const val = Number(rows[0].setting_value);
      const pct = !Number.isNaN(val) && val > 0 && val <= 100 ? val : 50;
      if (redis && (redis.status === 'ready' || redis.status === 'connect')) {
        await redis.set('boreal:settings:daily_giveaway_pot_percentage', String(pct), 'EX', 300);
      }
      return pct;
    }
    return 50;
  } catch (error) {
    logger.db.warn('Error al consultar setting daily_giveaway_pot_percentage en admin:', error);
    return 50;
  }
}

export async function setDailyGiveawayPotPercentage(percentage: number): Promise<boolean> {
  try {
    const safePct = Math.min(100, Math.max(1, Math.round(percentage)));
    const val = String(safePct);
    await pool.query(
      `INSERT INTO system_settings (setting_key, setting_value, description)
       VALUES ('daily_giveaway_pot_percentage', ?, 'Porcentaje de la recaudación destinado a la bolsa acumulada del ganador')
       ON DUPLICATE KEY UPDATE setting_value = ?`,
      [val, val]
    );
    if (redis && (redis.status === 'ready' || redis.status === 'connect')) {
      await redis.set('boreal:settings:daily_giveaway_pot_percentage', val, 'EX', 86400);
      await redis.del('giveaway:daily:current');
      await redis.del('giveaways:active');
    }
    logger.app.info(`Porcentaje de acumulado para sorteo diario actualizado a: ${safePct}%`);
    return true;
  } catch (error) {
    logger.db.error('Error al actualizar setting daily_giveaway_pot_percentage en admin:', error);
    throw new Error('Error al actualizar el porcentaje del sorteo diario');
  }
}

export async function getActiveBankAccounts(): Promise<BankAccountItem[]> {
  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT id, uuid, bank_name, account_holder, account_type, clabe, card_number, account_number, currency, is_active
       FROM bank_accounts
       WHERE is_active = 1
       ORDER BY id ASC`
    );
    return rows as BankAccountItem[];
  } catch (error) {
    logger.db.error('Error al obtener cuentas bancarias activas:', error);
    return [];
  }
}

export async function getAllGiveaways(filters: {
  search?: string;
  status?: string;
  type?: string;
} = {}): Promise<AdminGiveawayItem[]> {
  try {
    const dailyPauseScheduled = await isDailyGiveawayPauseScheduled();

    let query = `
      SELECT g.id, g.uuid, g.title, g.slug, g.description, g.primary_image_url, g.image_urls,
             g.package_options, CAST(g.ticket_price AS DOUBLE) AS ticket_price,
             g.total_tickets, g.available_tickets, g.currency, g.type, g.status,
             g.start_date, g.end_date, g.draw_date, g.min_threshold_pct, g.countdown_hours,
             g.threshold_reached_at, g.winner_ticket_number, g.winner_name, g.winner_order_id,
             g.winner_announced_at, CAST(g.prize_amount AS DOUBLE) AS prize_amount,
             g.created_at, g.updated_at,
             COALESCE(tc.paid_count, 0) AS paid_tickets,
             COALESCE(tc.reserved_count, 0) AS reserved_tickets,
             COALESCE(oc.orders_count, 0) AS orders_count
      FROM giveaways g
      LEFT JOIN (
        SELECT giveaway_id,
               SUM(CASE WHEN status = 'paid' THEN 1 ELSE 0 END) AS paid_count,
               SUM(CASE WHEN status = 'reserved' AND reserved_until > NOW() THEN 1 ELSE 0 END) AS reserved_count
        FROM giveaway_tickets
        GROUP BY giveaway_id
      ) tc ON tc.giveaway_id = g.id
      LEFT JOIN (
        SELECT giveaway_id, COUNT(*) AS orders_count
        FROM orders
        GROUP BY giveaway_id
      ) oc ON oc.giveaway_id = g.id
      WHERE 1=1
    `;

    const params: any[] = [];

    if (filters.type && filters.type !== 'all') {
      query += ` AND g.type = ?`;
      params.push(filters.type);
    }

    if (filters.status && filters.status !== 'all') {
      query += ` AND g.status = ?`;
      params.push(filters.status);
    }

    if (filters.search && filters.search.trim()) {
      query += ` AND (g.title LIKE ? OR g.slug LIKE ? OR g.uuid LIKE ?)`;
      const term = `%${filters.search.trim()}%`;
      params.push(term, term, term);
    }

    query += `
      ORDER BY
        CASE
          WHEN g.type = 'daily' AND g.status = 'active' THEN -1
          WHEN g.status = 'active' THEN 0
          WHEN g.status = 'paused' THEN 1
          WHEN g.status = 'draft' THEN 2
          ELSE 3
        END ASC,
        g.created_at DESC
    `;

    const [rows] = await pool.query<RowDataPacket[]>(query, params);

    const [bankRows] = await pool.query<RowDataPacket[]>(
      `SELECT gba.giveaway_id, ba.id, ba.bank_name, ba.account_holder, ba.account_type
       FROM giveaway_bank_accounts gba
       INNER JOIN bank_accounts ba ON ba.id = gba.bank_account_id
       WHERE gba.is_active = 1`
    );

    const bankMap = new Map<number, Array<{ account_holder: string; account_type: string; bank_name: string; id: number }>>();
    for (const b of bankRows) {
      const gid = Number(b.giveaway_id);
      if (!bankMap.has(gid)) {
        bankMap.set(gid, []);
      }
      bankMap.get(gid)!.push({
        account_holder: b.account_holder,
        account_type: b.account_type,
        bank_name: b.bank_name,
        id: b.id,
      });
    }

    return rows.map((r) => {
      const paidTickets = Number(r.paid_tickets || 0);
      const reservedTickets = Number(r.reserved_tickets || 0);
      const ticketPrice = Number(r.ticket_price || 0);
      const totalTickets = Number(r.total_tickets || 100);
      const revenue = Math.round(paidTickets * ticketPrice * 100) / 100;
      const progressPct = totalTickets > 0 ? Math.min(100, Math.round((paidTickets / totalTickets) * 1000) / 10) : 0;

      let canPause = true;
      let pauseBlockReason: string | null = null;

      if (r.type === 'daily') {
        if (r.status === 'active') {
          if (paidTickets > 0) {
            canPause = false;
            pauseBlockReason = 'El sorteo diario en curso ya tiene boletos vendidos. Para proteger a los participantes, debe concluir su ciclo. Puedes programar la suspensión del siguiente sorteo diario.';
          } else {
            canPause = true;
          }
        } else if (r.status === 'paused') {
          canPause = false;
        } else {
          canPause = false;
          pauseBlockReason = 'Este sorteo no se encuentra activo.';
        }
      } else {
        if (r.status !== 'active') {
          canPause = false;
        }
      }

      let parsedImages: string[] = [];
      try {
        parsedImages = typeof r.image_urls === 'string' ? JSON.parse(r.image_urls) : (r.image_urls || []);
      } catch (_) {
        parsedImages = [];
      }

      let parsedPackages: number[] = [];
      try {
        parsedPackages = typeof r.package_options === 'string' ? JSON.parse(r.package_options) : (r.package_options || [1, 3, 5, 10, 20]);
      } catch (_) {
        parsedPackages = [1, 3, 5, 10, 20];
      }

      return {
        available_tickets: Number(r.available_tickets ?? totalTickets - paidTickets),
        bank_accounts: bankMap.get(Number(r.id)) || [],
        can_pause: canPause,
        countdown_hours: Number(r.countdown_hours || 72),
        created_at: r.created_at ? new Date(r.created_at).toISOString() : new Date().toISOString(),
        currency: r.currency || 'MXN',
        daily_pause_next_scheduled: r.type === 'daily' ? dailyPauseScheduled : false,
        description: r.description,
        draw_date: r.draw_date ? new Date(r.draw_date).toISOString() : null,
        end_date: r.end_date ? new Date(r.end_date).toISOString() : new Date().toISOString(),
        id: Number(r.id),
        image_urls: parsedImages,
        min_threshold_pct: Number(r.min_threshold_pct || 0),
        orders_count: Number(r.orders_count || 0),
        package_options: parsedPackages,
        paid_tickets: paidTickets,
        pause_block_reason: pauseBlockReason,
        primary_image_url: r.primary_image_url,
        prize_amount: r.prize_amount !== null ? Number(r.prize_amount) : null,
        progress_pct: progressPct,
        reserved_tickets: reservedTickets,
        revenue_collected: revenue,
        slug: r.slug,
        start_date: r.start_date ? new Date(r.start_date).toISOString() : new Date().toISOString(),
        status: r.status,
        threshold_reached_at: r.threshold_reached_at ? new Date(r.threshold_reached_at).toISOString() : null,
        ticket_price: ticketPrice,
        title: r.title,
        total_tickets: totalTickets,
        type: r.type,
        updated_at: r.updated_at ? new Date(r.updated_at).toISOString() : new Date().toISOString(),
        uuid: r.uuid,
        winner_announced_at: r.winner_announced_at ? new Date(r.winner_announced_at).toISOString() : null,
        winner_name: r.winner_name,
        winner_order_id: r.winner_order_id ? Number(r.winner_order_id) : null,
        winner_ticket_number: r.winner_ticket_number ? Number(r.winner_ticket_number) : null,
      };
    });
  } catch (error) {
    logger.db.error('Error al consultar sorteos en admin:', error);
    throw new Error('Error al obtener la lista de sorteos');
  }
}

export async function getGiveawayByUuid(uuid: string): Promise<AdminGiveawayItem | null> {
  const items = await getAllGiveaways({ search: uuid });
  return items.find((item) => item.uuid === uuid) || null;
}

export async function createGiveaway(input: CreateGiveawayInput): Promise<AdminGiveawayItem> {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const uuid = crypto.randomUUID();
    const title = input.title.trim();
    if (!title) {
      throw new Error('El título del sorteo es obligatorio.');
    }

    let slug = input.slug ? slugify(input.slug) : slugify(title);
    if (!slug) {
      slug = `sorteo-${crypto.randomBytes(3).toString('hex')}`;
    }

    const [existingSlug] = await conn.query<RowDataPacket[]>(
      `SELECT id FROM giveaways WHERE slug = ? LIMIT 1`,
      [slug]
    );
    if (existingSlug.length > 0) {
      slug = `${slug}-${crypto.randomBytes(2).toString('hex')}`;
    }

    const type = input.type || 'standard';
    const status = input.status || 'draft';
    const ticketPrice = Number(input.ticket_price);
    const totalTickets = Number(input.total_tickets);

    if (isNaN(ticketPrice) || ticketPrice <= 0) {
      throw new Error('El precio del boleto debe ser un número positivo.');
    }
    if (isNaN(totalTickets) || totalTickets < 1) {
      throw new Error('El total de boletos debe ser al menos 1.');
    }

    const currency = input.currency || 'MXN';
    const description = input.description ? input.description.trim() : null;
    const primaryImageUrl = input.primary_image_url.trim();
    const imageUrls = JSON.stringify(input.image_urls && input.image_urls.length > 0 ? input.image_urls : [primaryImageUrl]);
    const packageOptions = JSON.stringify(input.package_options && input.package_options.length > 0 ? input.package_options : [1, 3, 5, 10, 20]);
    const startDate = input.start_date ? new Date(input.start_date) : new Date();
    const endDate = new Date(input.end_date);
    const drawDate = input.draw_date ? new Date(input.draw_date) : endDate;
    const minThresholdPct = Math.max(0, Math.min(100, Number(input.min_threshold_pct || 0)));
    const countdownHours = Math.max(1, Number(input.countdown_hours || 72));
    const prizeAmount = input.prize_amount !== undefined && input.prize_amount !== null && !isNaN(Number(input.prize_amount))
      ? Number(input.prize_amount)
      : null;

    const [insertResult] = await conn.query<ResultSetHeader>(
      `INSERT INTO giveaways (
        uuid, title, slug, description, primary_image_url, image_urls, package_options,
        ticket_price, total_tickets, available_tickets, currency, type, status,
        start_date, end_date, draw_date, min_threshold_pct, countdown_hours, prize_amount
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        uuid,
        title,
        slug,
        description,
        primaryImageUrl,
        imageUrls,
        packageOptions,
        ticketPrice,
        totalTickets,
        totalTickets,
        currency,
        type,
        status,
        startDate,
        endDate,
        drawDate,
        minThresholdPct,
        countdownHours,
        prizeAmount,
      ]
    );

    const giveawayId = insertResult.insertId;

    if (input.bank_account_ids && input.bank_account_ids.length > 0) {
      const bankValues = input.bank_account_ids.map((bid) => [giveawayId, bid, 1]);
      await conn.query(
        `INSERT IGNORE INTO giveaway_bank_accounts (giveaway_id, bank_account_id, is_active) VALUES ?`,
        [bankValues]
      );
    } else {
      await conn.query(
        `INSERT INTO giveaway_bank_accounts (giveaway_id, bank_account_id, is_active)
         SELECT ?, id, 1 FROM bank_accounts WHERE is_active = 1
         ON DUPLICATE KEY UPDATE is_active = 1`,
        [giveawayId]
      );
    }

    await conn.commit();

    if (redis && (redis.status === 'ready' || redis.status === 'connect')) {
      await redis.del('giveaways:active');
      if (type === 'daily') {
        await redis.del('giveaway:daily:current');
      }
    }

    logger.app.info(`Sorteo creado exitosamente [${type}] '${title}' (UUID: ${uuid}) con estado '${status}'`);

    const created = await getGiveawayByUuid(uuid);
    if (!created) {
      throw new Error('No se pudo recuperar el sorteo recién creado.');
    }
    return created;
  } catch (error) {
    await conn.rollback();
    logger.db.error('Error al crear sorteo en admin:', error);
    throw error;
  } finally {
    conn.release();
  }
}

export async function updateGiveaway(uuid: string, input: UpdateGiveawayInput): Promise<AdminGiveawayItem> {
  const current = await getGiveawayByUuid(uuid);
  if (!current) {
    throw new Error('El sorteo especificado no fue encontrado.');
  }

  if (current.status === 'completed') {
    throw new Error('No es posible modificar un sorteo que ya ha concluido y tiene ganador asignado.');
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const hasSales = current.paid_tickets > 0;

    let ticketPrice = current.ticket_price;
    let totalTickets = current.total_tickets;

    if (input.ticket_price !== undefined && input.ticket_price !== current.ticket_price) {
      if (hasSales) {
        throw new Error('No es posible modificar el precio del boleto de un sorteo con boletos vendidos.');
      }
      ticketPrice = Number(input.ticket_price);
    }

    if (input.total_tickets !== undefined && input.total_tickets !== current.total_tickets) {
      if (hasSales) {
        throw new Error('No es posible modificar el total de boletos de un sorteo con boletos vendidos.');
      }
      totalTickets = Number(input.total_tickets);
    }

    let slug = current.slug;
    if (input.slug && input.slug !== current.slug) {
      const newSlug = slugify(input.slug);
      const [slugCheck] = await conn.query<RowDataPacket[]>(
        `SELECT id FROM giveaways WHERE slug = ? AND id != ? LIMIT 1`,
        [newSlug, current.id]
      );
      if (slugCheck.length > 0) {
        throw new Error('El slug indicado ya está en uso por otro sorteo.');
      }
      slug = newSlug;
    }

    const title = input.title !== undefined ? input.title.trim() : current.title;
    const description = input.description !== undefined ? (input.description ? input.description.trim() : null) : current.description;
    const primaryImageUrl = input.primary_image_url !== undefined ? input.primary_image_url.trim() : current.primary_image_url;
    const imageUrls = input.image_urls !== undefined ? JSON.stringify(input.image_urls) : JSON.stringify(current.image_urls);
    const packageOptions = input.package_options !== undefined ? JSON.stringify(input.package_options) : JSON.stringify(current.package_options);
    const startDate = input.start_date ? new Date(input.start_date) : new Date(current.start_date);
    const endDate = input.end_date ? new Date(input.end_date) : new Date(current.end_date);
    const drawDate = input.draw_date ? new Date(input.draw_date) : (current.draw_date ? new Date(current.draw_date) : endDate);
    const minThresholdPct = input.min_threshold_pct !== undefined ? Math.max(0, Math.min(100, Number(input.min_threshold_pct))) : current.min_threshold_pct;
    const countdownHours = input.countdown_hours !== undefined ? Math.max(1, Number(input.countdown_hours)) : current.countdown_hours;
    const prizeAmount = input.prize_amount !== undefined
      ? (input.prize_amount !== null && !isNaN(Number(input.prize_amount)) ? Number(input.prize_amount) : null)
      : current.prize_amount;

    await conn.query(
      `UPDATE giveaways SET
        title = ?,
        slug = ?,
        description = ?,
        primary_image_url = ?,
        image_urls = ?,
        package_options = ?,
        ticket_price = ?,
        total_tickets = ?,
        start_date = ?,
        end_date = ?,
        draw_date = ?,
        min_threshold_pct = ?,
        countdown_hours = ?,
        prize_amount = ?
       WHERE id = ?`,
      [
        title,
        slug,
        description,
        primaryImageUrl,
        imageUrls,
        packageOptions,
        ticketPrice,
        totalTickets,
        startDate,
        endDate,
        drawDate,
        minThresholdPct,
        countdownHours,
        prizeAmount,
        current.id,
      ]
    );

    if (input.bank_account_ids && Array.isArray(input.bank_account_ids)) {
      await conn.query(`DELETE FROM giveaway_bank_accounts WHERE giveaway_id = ?`, [current.id]);
      if (input.bank_account_ids.length > 0) {
        const bankValues = input.bank_account_ids.map((bid) => [current.id, bid, 1]);
        await conn.query(
          `INSERT INTO giveaway_bank_accounts (giveaway_id, bank_account_id, is_active) VALUES ?`,
          [bankValues]
        );
      }
    }

    await conn.commit();

    if (redis && (redis.status === 'ready' || redis.status === 'connect')) {
      await redis.del(`giveaway:${uuid}`);
      await redis.del(`giveaway:${uuid}:tickets`);
      await redis.del('giveaways:active');
      if (current.type === 'daily') {
        await redis.del('giveaway:daily:current');
      }
    }

    logger.app.info(`Sorteo actualizado exitosamente '${title}' (UUID: ${uuid})`);

    const updated = await getGiveawayByUuid(uuid);
    if (!updated) {
      throw new Error('No se pudo recuperar el sorteo actualizado.');
    }
    return updated;
  } catch (error) {
    await conn.rollback();
    logger.db.error('Error al actualizar sorteo en admin:', error);
    throw error;
  } finally {
    conn.release();
  }
}

export async function updateGiveawayStatus(
  uuid: string,
  newStatus: 'active' | 'paused' | 'cancelled',
  forceWithSales = false
): Promise<AdminGiveawayItem> {
  const current = await getGiveawayByUuid(uuid);
  if (!current) {
    throw new Error('El sorteo especificado no fue encontrado.');
  }

  if (current.status === 'completed') {
    throw new Error('Un sorteo concluido con ganador no puede cambiar de estado.');
  }

  if (current.status === newStatus) {
    return current;
  }

  if (newStatus === 'paused') {
    if (current.type === 'daily' && current.paid_tickets > 0) {
      throw new Error(
        'No es posible pausar el sorteo diario actual ya que tiene boletos pagados por usuarios. ' +
        'Para detener el sorteo diario de forma legal, programa la pausa para el siguiente sorteo.'
      );
    }
  }

  if (newStatus === 'cancelled') {
    if (current.paid_tickets > 0 && !forceWithSales) {
      throw new Error(
        'El sorteo tiene boletos vendidos. Debes confirmar explícitamente la cancelación forzosa.'
      );
    }
  }

  if (newStatus === 'active') {
    const end = new Date(current.end_date);
    if (end.getTime() <= Date.now()) {
      throw new Error('No se puede activar un sorteo cuya fecha de cierre ya expiró. Por favor extiende la fecha de cierre primero.');
    }
  }

  await pool.query(`UPDATE giveaways SET status = ? WHERE id = ?`, [newStatus, current.id]);

  if (redis && (redis.status === 'ready' || redis.status === 'connect')) {
    await redis.del(`giveaway:${uuid}`);
    await redis.del('giveaways:active');
    if (current.type === 'daily') {
      await redis.del('giveaway:daily:current');
    }
  }

  logger.app.info(`Estado del sorteo '${current.title}' (UUID: ${uuid}) modificado a '${newStatus}'`);

  const updated = await getGiveawayByUuid(uuid);
  if (!updated) {
    throw new Error('Error al refrescar el sorteo tras cambio de estado.');
  }
  return updated;
}

export async function executeManualDraw(uuid: string): Promise<AdminGiveawayItem> {
  const current = await getGiveawayByUuid(uuid);
  if (!current) {
    throw new Error('El sorteo especificado no fue encontrado.');
  }

  if (current.status === 'completed') {
    throw new Error('Este sorteo ya ha sido concluido anteriormente.');
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [countRows] = await conn.query<RowDataPacket[]>(
      `SELECT COUNT(*) AS total_paid FROM giveaway_tickets WHERE giveaway_id = ? AND status = 'paid'`,
      [current.id]
    );
    const totalPaid = Number(countRows[0]?.total_paid || 0);

    let winnerTicketNumber: number | null = null;
    let winnerName = 'Sin participantes';
    let winnerOrderId: number | null = null;

    if (totalPaid > 0) {
      const randomIndex = crypto.randomInt(0, totalPaid);
      const [chosenRows] = await conn.query<RowDataPacket[]>(
        `SELECT ticket_number, order_id
         FROM giveaway_tickets
         WHERE giveaway_id = ? AND status = 'paid'
         ORDER BY id ASC
         LIMIT 1 OFFSET ?
         FOR UPDATE`,
        [current.id, randomIndex]
      );

      if (chosenRows.length > 0) {
        const chosen = chosenRows[0];
        winnerTicketNumber = Number(chosen.ticket_number);
        winnerOrderId = chosen.order_id ? Number(chosen.order_id) : null;

        if (winnerOrderId) {
          const [orderRows] = await conn.query<RowDataPacket[]>(
            `SELECT customer_name FROM orders WHERE id = ?`,
            [winnerOrderId]
          );
          if (orderRows.length > 0) {
            winnerName = orderRows[0].customer_name;
          }
        }

        await conn.query(
          `UPDATE giveaway_tickets SET is_winner = 1 WHERE giveaway_id = ? AND ticket_number = ?`,
          [current.id, winnerTicketNumber]
        );

        if (winnerOrderId) {
          await conn.query(`UPDATE orders SET is_winner = 1 WHERE id = ?`, [winnerOrderId]);
        }
      }
    }

    const prizeAmount = current.type === 'daily'
      ? Math.round(totalPaid * (current.ticket_price * 0.50))
      : (current.prize_amount !== null ? current.prize_amount : null);

    await conn.query(
      `UPDATE giveaways
       SET status = 'completed',
           winner_ticket_number = ?,
           winner_name = ?,
           winner_order_id = ?,
           winner_announced_at = NOW(),
           prize_amount = ?
       WHERE id = ?`,
      [winnerTicketNumber, winnerName, winnerOrderId, prizeAmount, current.id]
    );

    await conn.commit();

    if (redis && (redis.status === 'ready' || redis.status === 'connect')) {
      await redis.del('giveaways:active');
      await redis.del(`giveaway:${uuid}`);
      await redis.del(`giveaway:${uuid}:tickets`);
      await redis.del('giveaways:winners');
      if (current.type === 'daily') {
        await redis.del('giveaway:daily:current');
        await redis.del('giveaway:daily:recent_winners:5');
      }
    }

    logger.app.info(
      `Sorteo ejecutado manualmente para '${current.title}' (ID: ${current.id}). Ganador: ${winnerName}, Boleto: #${winnerTicketNumber ?? 'N/A'}`
    );

    const updated = await getGiveawayByUuid(uuid);
    if (!updated) {
      throw new Error('Error al refrescar sorteo tras ejecución.');
    }
    return updated;
  } catch (error) {
    await conn.rollback();
    logger.db.error('Error al ejecutar sorteo manual en admin:', error);
    throw error;
  } finally {
    conn.release();
  }
}

export async function deleteDraftGiveaway(uuid: string): Promise<boolean> {
  const current = await getGiveawayByUuid(uuid);
  if (!current) {
    throw new Error('El sorteo especificado no fue encontrado.');
  }

  if (current.status !== 'draft' && current.status !== 'cancelled') {
    throw new Error('Solo se pueden eliminar sorteos en estado Borrador o Cancelado.');
  }

  if (current.orders_count > 0 || current.paid_tickets > 0) {
    throw new Error('No es posible eliminar un sorteo que tiene órdenes registradas. Debe conservarse para auditoría.');
  }

  await pool.query(`DELETE FROM giveaways WHERE id = ?`, [current.id]);

  if (redis && (redis.status === 'ready' || redis.status === 'connect')) {
    await redis.del(`giveaway:${uuid}`);
    await redis.del('giveaways:active');
  }

  logger.app.info(`Sorteo eliminado permanentemente '${current.title}' (UUID: ${uuid})`);
  return true;
}

export async function saveUploadedGiveawayImage(fileData: string, originalName?: string): Promise<string> {
  if (!fileData || typeof fileData !== 'string') {
    throw new Error('No se proporcionaron datos de imagen válidos.');
  }

  let mimeType = 'image/jpeg';
  let base64String = fileData;

  if (fileData.startsWith('data:')) {
    const match = fileData.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) {
      throw new Error('Formato de datos de imagen base64 no válido.');
    }
    mimeType = match[1];
    base64String = match[2];
  }

  const allowedMimeTypes: Record<string, string> = {
    'image/gif': 'gif',
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/svg+xml': 'svg',
    'image/webp': 'webp',
  };

  let ext = allowedMimeTypes[mimeType.toLowerCase()];
  if (!ext && originalName) {
    const extMatch = originalName.split('.').pop()?.toLowerCase();
    if (extMatch && ['jpg', 'jpeg', 'png', 'webp', 'svg', 'gif'].includes(extMatch)) {
      ext = extMatch === 'jpeg' ? 'jpg' : extMatch;
    }
  }

  if (!ext) {
    throw new Error('Tipo de archivo no permitido. Solo se admiten formatos PNG, JPG, WEBP, SVG y GIF.');
  }

  const buffer = Buffer.from(base64String, 'base64');
  const maxSize = 10 * 1024 * 1024;
  if (buffer.length > maxSize) {
    throw new Error('El archivo excede el tamaño máximo permitido de 10 MB.');
  }

  const filename = `giveaway-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.${ext}`;
  const rootUploadsDir = path.resolve(process.cwd(), 'public/uploads/giveaways');
  const adminUploadsDir = path.resolve(process.cwd(), 'admin/public/uploads/giveaways');

  await Promise.all([
    fs.promises.mkdir(rootUploadsDir, { recursive: true }),
    fs.promises.mkdir(adminUploadsDir, { recursive: true }),
  ]);

  await Promise.all([
    fs.promises.writeFile(path.join(rootUploadsDir, filename), buffer),
    fs.promises.writeFile(path.join(adminUploadsDir, filename), buffer),
  ]);

  logger.app.info(`Imagen de sorteo subida con éxito: /uploads/giveaways/${filename}`);
  return `/uploads/giveaways/${filename}`;
}
