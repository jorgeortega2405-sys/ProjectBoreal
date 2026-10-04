import { AssignedGiveaway, BankAccount, CreateBankAccountInput, UpdateBankAccountInput } from '../types/bank-accounts.types.js';
import { deleteCache, deleteCachePattern } from '../config/redis.config.js';
import { logger } from './logger.service.js';
import { pool } from '../config/database.config.js';
import crypto from 'crypto';
import { ResultSetHeader, RowDataPacket } from 'mysql2/promise';

interface BankAccountRow extends RowDataPacket {
  account_holder: string;
  account_number: string | null;
  account_type: 'clabe' | 'card' | 'both';
  bank_name: string;
  card_number: string | null;
  clabe: string | null;
  created_at: Date | string;
  currency: string;
  id: number;
  is_active: number;
  updated_at: Date | string;
  uuid: string;
}

interface GiveawayAssignRow extends RowDataPacket {
  bank_account_id: number;
  giveaway_id: number;
  giveaway_title: string;
  giveaway_uuid: string;
  is_active: number;
}

interface GiveawayOptionRow extends RowDataPacket {
  id: number;
  slug: string;
  status: string;
  title: string;
  uuid: string;
}

export async function getAdminBankAccounts(): Promise<BankAccount[]> {
  try {
    const [accountRows] = await pool.query<BankAccountRow[]>(
      `SELECT id, uuid, bank_name, account_holder, account_type, clabe,
              account_number, card_number, currency, is_active, created_at, updated_at
       FROM bank_accounts
       ORDER BY id ASC`
    );

    const [giveawayRows] = await pool.query<GiveawayAssignRow[]>(
      `SELECT gba.bank_account_id, gba.giveaway_id, gba.is_active,
              g.uuid AS giveaway_uuid, g.title AS giveaway_title
       FROM giveaway_bank_accounts gba
       INNER JOIN giveaways g ON g.id = gba.giveaway_id
       ORDER BY gba.id ASC`
    );

    const map = new Map<number, AssignedGiveaway[]>();
    for (const g of giveawayRows) {
      if (!map.has(g.bank_account_id)) {
        map.set(g.bank_account_id, []);
      }
      map.get(g.bank_account_id)!.push({
        id: Number(g.giveaway_id),
        is_active: Number(g.is_active),
        title: g.giveaway_title,
        uuid: g.giveaway_uuid,
      });
    }

    return accountRows.map((r) => ({
      account_holder: r.account_holder,
      account_number: r.account_number,
      account_type: r.account_type,
      bank_name: r.bank_name,
      card_number: r.card_number,
      clabe: r.clabe,
      created_at: new Date(r.created_at).toISOString(),
      currency: r.currency,
      giveaways: map.get(Number(r.id)) || [],
      id: Number(r.id),
      is_active: Number(r.is_active),
      updated_at: new Date(r.updated_at).toISOString(),
      uuid: r.uuid,
    }));
  } catch (error) {
    logger.db.error('Error al obtener cuentas bancarias en backend admin', error);
    throw new Error('Error al consultar las cuentas bancarias.');
  }
}

export async function getGiveawaysForAssignment(): Promise<Array<{ id: number; slug: string; status: string; title: string; uuid: string }>> {
  try {
    const [rows] = await pool.query<GiveawayOptionRow[]>(
      `SELECT id, uuid, title, slug, status
       FROM giveaways
       ORDER BY FIELD(status, 'active', 'draft', 'paused', 'completed', 'cancelled'), created_at DESC`
    );
    return rows.map((r) => ({
      id: Number(r.id),
      slug: r.slug,
      status: r.status,
      title: r.title,
      uuid: r.uuid,
    }));
  } catch (error) {
    logger.db.error('Error al obtener sorteos para asignación de cuentas', error);
    throw new Error('Error al consultar sorteos.');
  }
}

export async function createAdminBankAccount(data: CreateBankAccountInput): Promise<BankAccount> {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const uuid = crypto.randomUUID();
    const isActive = data.is_active !== undefined ? (data.is_active ? 1 : 0) : 1;
    const currency = data.currency?.trim() || 'MXN';
    const clabe = data.clabe?.trim() || null;
    const cardNumber = data.card_number?.trim() || null;
    const accountNumber = data.account_number?.trim() || null;

    const [result] = await conn.query<ResultSetHeader>(
      `INSERT INTO bank_accounts (
        uuid, bank_name, account_holder, account_type, clabe, card_number,
        account_number, currency, is_active
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        uuid,
        data.bank_name.trim(),
        data.account_holder.trim(),
        data.account_type,
        clabe,
        cardNumber,
        accountNumber,
        currency,
        isActive,
      ]
    );

    const bankAccountId = result.insertId;

    if (Array.isArray(data.giveaway_ids) && data.giveaway_ids.length > 0) {
      for (const gId of data.giveaway_ids) {
        await conn.query(
          `INSERT INTO giveaway_bank_accounts (giveaway_id, bank_account_id, is_active)
           VALUES (?, ?, 1)
           ON DUPLICATE KEY UPDATE is_active = 1`,
          [gId, bankAccountId]
        );
      }
    }

    await conn.commit();

    await deleteCache('bank_accounts');
    await deleteCachePattern('bank_accounts:*');

    return {
      account_holder: data.account_holder.trim(),
      account_number: accountNumber,
      account_type: data.account_type,
      bank_name: data.bank_name.trim(),
      card_number: cardNumber,
      clabe,
      created_at: new Date().toISOString(),
      currency,
      id: bankAccountId,
      is_active: isActive,
      updated_at: new Date().toISOString(),
      uuid,
    };
  } catch (error) {
    await conn.rollback();
    logger.db.error('Error al crear cuenta bancaria en backend admin', error);
    throw new Error('Error al registrar la cuenta bancaria.');
  } finally {
    conn.release();
  }
}

export async function updateAdminBankAccount(uuid: string, data: UpdateBankAccountInput): Promise<boolean> {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [existing] = await conn.query<RowDataPacket[]>(
      `SELECT id FROM bank_accounts WHERE uuid = ? LIMIT 1 FOR UPDATE`,
      [uuid]
    );

    if (existing.length === 0) {
      await conn.rollback();
      throw new Error('Cuenta bancaria no encontrada.');
    }

    const accountId = Number(existing[0].id);

    const updates: string[] = [];
    const params: unknown[] = [];

    if (data.bank_name !== undefined) {
      updates.push('bank_name = ?');
      params.push(data.bank_name.trim());
    }
    if (data.account_holder !== undefined) {
      updates.push('account_holder = ?');
      params.push(data.account_holder.trim());
    }
    if (data.account_type !== undefined) {
      updates.push('account_type = ?');
      params.push(data.account_type);
    }
    if (data.clabe !== undefined) {
      updates.push('clabe = ?');
      params.push(data.clabe?.trim() || null);
    }
    if (data.card_number !== undefined) {
      updates.push('card_number = ?');
      params.push(data.card_number?.trim() || null);
    }
    if (data.account_number !== undefined) {
      updates.push('account_number = ?');
      params.push(data.account_number?.trim() || null);
    }
    if (data.currency !== undefined) {
      updates.push('currency = ?');
      params.push(data.currency.trim());
    }
    if (data.is_active !== undefined) {
      updates.push('is_active = ?');
      params.push(data.is_active ? 1 : 0);
    }

    if (updates.length > 0) {
      params.push(uuid);
      await conn.query(
        `UPDATE bank_accounts SET ${updates.join(', ')}, updated_at = NOW() WHERE uuid = ?`,
        params
      );
    }

    if (Array.isArray(data.giveaway_ids)) {
      await conn.query(`DELETE FROM giveaway_bank_accounts WHERE bank_account_id = ?`, [accountId]);
      for (const gId of data.giveaway_ids) {
        await conn.query(
          `INSERT INTO giveaway_bank_accounts (giveaway_id, bank_account_id, is_active)
           VALUES (?, ?, 1)
           ON DUPLICATE KEY UPDATE is_active = 1`,
          [gId, accountId]
        );
      }
    }

    await conn.commit();

    await deleteCache('bank_accounts');
    await deleteCachePattern('bank_accounts:*');

    return true;
  } catch (error) {
    await conn.rollback();
    logger.db.error(`Error al actualizar cuenta bancaria ${uuid}`, error);
    throw error;
  } finally {
    conn.release();
  }
}

export async function toggleAdminBankAccount(uuid: string, isActive: boolean): Promise<boolean> {
  try {
    const [result] = await pool.query<ResultSetHeader>(
      `UPDATE bank_accounts SET is_active = ?, updated_at = NOW() WHERE uuid = ?`,
      [isActive ? 1 : 0, uuid]
    );

    if (result.affectedRows === 0) {
      throw new Error('Cuenta bancaria no encontrada.');
    }

    await deleteCache('bank_accounts');
    await deleteCachePattern('bank_accounts:*');

    return true;
  } catch (error) {
    logger.db.error(`Error al conmutar estado de cuenta bancaria ${uuid}`, error);
    throw error;
  }
}

export async function deleteAdminBankAccount(uuid: string): Promise<boolean> {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [existing] = await conn.query<RowDataPacket[]>(
      `SELECT id FROM bank_accounts WHERE uuid = ? LIMIT 1 FOR UPDATE`,
      [uuid]
    );

    if (existing.length === 0) {
      await conn.rollback();
      throw new Error('Cuenta bancaria no encontrada.');
    }

    const accountId = Number(existing[0].id);

    await conn.query(`DELETE FROM giveaway_bank_accounts WHERE bank_account_id = ?`, [accountId]);
    await conn.query(`DELETE FROM bank_accounts WHERE id = ?`, [accountId]);

    await conn.commit();

    await deleteCache('bank_accounts');
    await deleteCachePattern('bank_accounts:*');

    return true;
  } catch (error) {
    await conn.rollback();
    logger.db.error(`Error al eliminar cuenta bancaria ${uuid}`, error);
    throw error;
  } finally {
    conn.release();
  }
}
