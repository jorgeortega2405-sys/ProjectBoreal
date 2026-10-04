import { pool } from '../config/database.config.js';
import { redis } from '../config/redis.config.js';
import { Giveaway } from '../types/giveaway.types.js';
import { logger } from './logger.service.js';
import crypto from 'crypto';
import { ResultSetHeader, RowDataPacket } from 'mysql2/promise';

interface GiveawayRow extends RowDataPacket, Giveaway {}

export interface CreateGiveawayInput {
  countdown_hours?: number;
  currency?: string;
  description?: string | null;
  end_date: string;
  image_urls?: string[] | null;
  min_threshold_pct?: number;
  primary_image_url: string;
  start_date?: string;
  status?: string;
  ticket_price: number;
  title: string;
  total_tickets: number;
}

export interface UpdateGiveawayInput {
  countdown_hours?: number;
  currency?: string;
  description?: string | null;
  end_date?: string;
  image_urls?: string[] | null;
  min_threshold_pct?: number;
  primary_image_url?: string;
  start_date?: string;
  status?: string;
  ticket_price?: number;
  title?: string;
  total_tickets?: number;
}

function generateSlug(title: string): string {
  const base = title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '');
  const hash = crypto.randomBytes(3).toString('hex');
  return `${base}-${hash}`;
}

export async function getAllAdminGiveaways(): Promise<Giveaway[]> {
  try {
    const [rows] = await pool.query<GiveawayRow[]>(
      `SELECT id, uuid, title, slug, description, primary_image_url, image_urls,
              CAST(ticket_price AS DOUBLE) AS ticket_price,
              total_tickets, available_tickets, currency, status,
              start_date, end_date, min_threshold_pct, countdown_hours, threshold_reached_at,
              winner_ticket_number, winner_name, winner_announced_at, created_at, updated_at
       FROM giveaways
       ORDER BY 
          CASE WHEN status = 'active' THEN 0 ELSE 1 END ASC,
          created_at DESC`
    );

    return rows.map((row) => ({
      ...row,
      image_urls: typeof row.image_urls === 'string' ? JSON.parse(row.image_urls) : row.image_urls,
    }));
  } catch (error) {
    logger.db.error('Error al consultar sorteos en base de datos para panel administrativo', error);
    throw new Error('Error al obtener los sorteos');
  }
}

export async function getAdminGiveawayByUuid(uuid: string): Promise<Giveaway | null> {
  try {
    const [rows] = await pool.query<GiveawayRow[]>(
      `SELECT id, uuid, title, slug, description, primary_image_url, image_urls,
              CAST(ticket_price AS DOUBLE) AS ticket_price,
              total_tickets, available_tickets, currency, status,
              start_date, end_date, min_threshold_pct, countdown_hours, threshold_reached_at,
              winner_ticket_number, winner_name, winner_announced_at, created_at, updated_at
       FROM giveaways
       WHERE uuid = ?
       LIMIT 1`,
      [uuid]
    );

    if (rows.length === 0) return null;
    const row = rows[0];
    return {
      ...row,
      image_urls: typeof row.image_urls === 'string' ? JSON.parse(row.image_urls) : row.image_urls,
    };
  } catch (error) {
    logger.db.error('Error al consultar sorteo por UUID en Admin', error);
    throw new Error('Error al obtener el sorteo');
  }
}

export async function createAdminGiveaway(data: CreateGiveawayInput): Promise<{ id: number; uuid: string }> {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const uuid = crypto.randomUUID();
    const slug = generateSlug(data.title);
    const startDate = data.start_date || new Date().toISOString().slice(0, 19).replace('T', ' ');

    const [result] = await conn.query<ResultSetHeader>(
      `INSERT INTO giveaways (
        uuid, title, slug, description, primary_image_url, image_urls,
        ticket_price, total_tickets, available_tickets, currency, status,
        start_date, end_date, min_threshold_pct, countdown_hours
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        uuid,
        data.title,
        slug,
        data.description || null,
        data.primary_image_url,
        data.image_urls && data.image_urls.length > 0 ? JSON.stringify(data.image_urls) : null,
        data.ticket_price,
        data.total_tickets,
        data.total_tickets,
        data.currency || 'USD',
        data.status || 'active',
        startDate,
        data.end_date,
        data.min_threshold_pct || 0,
        data.countdown_hours || 48,
      ]
    );

    const giveawayId = result.insertId;

    if (data.total_tickets > 0 && data.total_tickets <= 500000) {
      const CHUNK_SIZE = 2000;
      for (let i = 1; i <= data.total_tickets; i += CHUNK_SIZE) {
        const chunkEnd = Math.min(i + CHUNK_SIZE - 1, data.total_tickets);
        const ticketValues: [number, number, string][] = [];
        for (let j = i; j <= chunkEnd; j++) {
          ticketValues.push([giveawayId, j, 'available']);
        }
        await conn.query(
          `INSERT IGNORE INTO giveaway_tickets (giveaway_id, ticket_number, status) VALUES ?`,
          [ticketValues]
        );
      }
    }

    await conn.commit();

    try {
      await redis.del('giveaways:active');
    } catch {}

    return { id: giveawayId, uuid };
  } catch (error) {
    await conn.rollback();
    logger.db.error('Error al crear sorteo en base de datos para Admin', error);
    throw new Error('Error al crear el sorteo');
  } finally {
    conn.release();
  }
}

export async function updateAdminGiveaway(uuid: string, data: UpdateGiveawayInput): Promise<boolean> {
  try {
    const fields: string[] = [];
    const values: any[] = [];

    if (data.title !== undefined) {
      fields.push('title = ?');
      values.push(data.title);
    }
    if (data.description !== undefined) {
      fields.push('description = ?');
      values.push(data.description);
    }
    if (data.primary_image_url !== undefined) {
      fields.push('primary_image_url = ?');
      values.push(data.primary_image_url);
    }
    if (data.image_urls !== undefined) {
      fields.push('image_urls = ?');
      values.push(data.image_urls && data.image_urls.length > 0 ? JSON.stringify(data.image_urls) : null);
    }
    if (data.ticket_price !== undefined) {
      fields.push('ticket_price = ?');
      values.push(data.ticket_price);
    }
    if (data.currency !== undefined) {
      fields.push('currency = ?');
      values.push(data.currency);
    }
    if (data.status !== undefined) {
      fields.push('status = ?');
      values.push(data.status);
    }
    if (data.start_date !== undefined) {
      fields.push('start_date = ?');
      values.push(data.start_date);
    }
    if (data.end_date !== undefined) {
      fields.push('end_date = ?');
      values.push(data.end_date);
    }
    if (data.min_threshold_pct !== undefined) {
      fields.push('min_threshold_pct = ?');
      values.push(data.min_threshold_pct);
    }
    if (data.countdown_hours !== undefined) {
      fields.push('countdown_hours = ?');
      values.push(data.countdown_hours);
    }

    if (fields.length === 0) return true;

    values.push(uuid);
    const [result] = await pool.query<ResultSetHeader>(
      `UPDATE giveaways SET ${fields.join(', ')} WHERE uuid = ?`,
      values
    );

    try {
      await redis.del('giveaways:active');
      await redis.del(`giveaway:${uuid}`);
    } catch {}

    return result.affectedRows > 0;
  } catch (error) {
    logger.db.error('Error al actualizar sorteo en Admin', error);
    throw new Error('Error al actualizar el sorteo');
  }
}
