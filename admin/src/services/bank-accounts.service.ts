import { pool } from '../config/database.config.js';
import { redis } from '../config/redis.config.js';
import { logger } from './logger.service.js';
import crypto from 'crypto';
import { ResultSetHeader, RowDataPacket } from 'mysql2/promise';

export interface BankAccountDetail {
  account_holder: string;
  account_number: string | null;
  account_type: 'clabe' | 'card' | 'both';
  active_giveaways_count: number;
  bank_name: string;
  card_number: string | null;
  clabe: string | null;
  created_at: string;
  currency: string;
  id: number;
  is_active: number;
  total_giveaways_count: number;
  updated_at: string;
  uuid: string;
}

export interface BankAccountGiveawayAssignment {
  giveaway_id: number;
  giveaway_status: string;
  giveaway_title: string;
  giveaway_type: string;
  giveaway_uuid: string;
  is_active: boolean;
  is_assigned: boolean;
}

export interface BankAccountsKpis {
  activeAccounts: number;
  giveawaysWithCoverageCount: number;
  inactiveAccounts: number;
  totalAccounts: number;
  uniqueBanksCount: number;
}

export interface CreateBankAccountInput {
  account_holder: string;
  account_number?: string | null;
  account_type: 'clabe' | 'card' | 'both';
  apply_to_all_active_giveaways?: boolean;
  bank_name: string;
  card_number?: string | null;
  clabe?: string | null;
  currency?: string;
  giveaway_ids?: number[];
  is_active?: boolean;
}

export interface UpdateBankAccountInput {
  account_holder?: string;
  account_number?: string | null;
  account_type?: 'clabe' | 'card' | 'both';
  bank_name?: string;
  card_number?: string | null;
  clabe?: string | null;
  currency?: string;
  is_active?: boolean;
}

export async function invalidateBankAccountsCache(): Promise<void> {
  try {
    if (redis.status === 'ready') {
      const keys = await redis.keys('bank_accounts*');
      if (keys.length > 0) {
        await redis.del(...keys);
      }
    }
  } catch (err) {
    logger.db.warn('No se pudo invalidar la caché de bank_accounts en Redis:', err);
  }
}

export async function getBankAccountsKpis(): Promise<BankAccountsKpis> {
  try {
    const [summaryRows] = await pool.query<RowDataPacket[]>(
      `SELECT
        COUNT(*) as total_accounts,
        SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) as active_accounts,
        SUM(CASE WHEN is_active = 0 THEN 1 ELSE 0 END) as inactive_accounts,
        COUNT(DISTINCT bank_name) as unique_banks
       FROM bank_accounts`
    );

    const [coverageRows] = await pool.query<RowDataPacket[]>(
      `SELECT COUNT(DISTINCT gba.giveaway_id) as coverage_count
       FROM giveaway_bank_accounts gba
       INNER JOIN giveaways g ON g.id = gba.giveaway_id
       INNER JOIN bank_accounts ba ON ba.id = gba.bank_account_id
       WHERE gba.is_active = 1 AND ba.is_active = 1 AND g.status IN ('active', 'paused', 'draft')`
    );

    const s = summaryRows[0] || {};
    const c = coverageRows[0] || {};

    return {
      activeAccounts: Number(s.active_accounts || 0),
      giveawaysWithCoverageCount: Number(c.coverage_count || 0),
      inactiveAccounts: Number(s.inactive_accounts || 0),
      totalAccounts: Number(s.total_accounts || 0),
      uniqueBanksCount: Number(s.unique_banks || 0),
    };
  } catch (error) {
    logger.db.error('Error al obtener KPIs de cuentas bancarias:', error);
    return {
      activeAccounts: 0,
      giveawaysWithCoverageCount: 0,
      inactiveAccounts: 0,
      totalAccounts: 0,
      uniqueBanksCount: 0,
    };
  }
}

export async function getAllBankAccounts(filters?: { search?: string; status?: string }): Promise<BankAccountDetail[]> {
  try {
    let whereClause = '1=1';
    const params: unknown[] = [];

    if (filters?.status === 'active') {
      whereClause += ' AND ba.is_active = 1';
    } else if (filters?.status === 'inactive') {
      whereClause += ' AND ba.is_active = 0';
    }

    if (filters?.search && filters.search.trim()) {
      const q = `%${filters.search.trim()}%`;
      whereClause += ' AND (ba.bank_name LIKE ? OR ba.account_holder LIKE ? OR ba.clabe LIKE ? OR ba.card_number LIKE ?)';
      params.push(q, q, q, q);
    }

    const query = `
      SELECT
        ba.id,
        ba.uuid,
        ba.bank_name,
        ba.account_holder,
        ba.account_type,
        ba.clabe,
        ba.card_number,
        ba.account_number,
        ba.currency,
        ba.is_active,
        ba.created_at,
        ba.updated_at,
        COUNT(CASE WHEN gba.is_active = 1 AND g.status IN ('active', 'paused') THEN 1 END) AS active_giveaways_count,
        COUNT(DISTINCT gba.giveaway_id) AS total_giveaways_count
      FROM bank_accounts ba
      LEFT JOIN giveaway_bank_accounts gba ON gba.bank_account_id = ba.id
      LEFT JOIN giveaways g ON g.id = gba.giveaway_id
      WHERE ${whereClause}
      GROUP BY ba.id
      ORDER BY ba.is_active DESC, ba.id ASC
    `;

    const [rows] = await pool.query<RowDataPacket[]>(query, params);

    return rows.map((r) => ({
      account_holder: r.account_holder,
      account_number: r.account_number,
      account_type: r.account_type,
      active_giveaways_count: Number(r.active_giveaways_count || 0),
      bank_name: r.bank_name,
      card_number: r.card_number,
      clabe: r.clabe,
      created_at: r.created_at,
      currency: r.currency || 'MXN',
      id: r.id,
      is_active: Number(r.is_active),
      total_giveaways_count: Number(r.total_giveaways_count || 0),
      updated_at: r.updated_at,
      uuid: r.uuid,
    }));
  } catch (error) {
    logger.db.error('Error al listar cuentas bancarias:', error);
    return [];
  }
}

export async function getBankAccountByUuid(uuid: string): Promise<{
  account: BankAccountDetail;
  giveaways: BankAccountGiveawayAssignment[];
} | null> {
  try {
    const [accountRows] = await pool.query<RowDataPacket[]>(
      `SELECT
        ba.id,
        ba.uuid,
        ba.bank_name,
        ba.account_holder,
        ba.account_type,
        ba.clabe,
        ba.card_number,
        ba.account_number,
        ba.currency,
        ba.is_active,
        ba.created_at,
        ba.updated_at,
        COUNT(CASE WHEN gba.is_active = 1 AND g.status IN ('active', 'paused') THEN 1 END) AS active_giveaways_count,
        COUNT(DISTINCT gba.giveaway_id) AS total_giveaways_count
      FROM bank_accounts ba
      LEFT JOIN giveaway_bank_accounts gba ON gba.bank_account_id = ba.id
      LEFT JOIN giveaways g ON g.id = gba.giveaway_id
      WHERE ba.uuid = ?
      GROUP BY ba.id`,
      [uuid]
    );

    if (accountRows.length === 0) return null;

    const r = accountRows[0];
    const account: BankAccountDetail = {
      account_holder: r.account_holder,
      account_number: r.account_number,
      account_type: r.account_type,
      active_giveaways_count: Number(r.active_giveaways_count || 0),
      bank_name: r.bank_name,
      card_number: r.card_number,
      clabe: r.clabe,
      created_at: r.created_at,
      currency: r.currency || 'MXN',
      id: r.id,
      is_active: Number(r.is_active),
      total_giveaways_count: Number(r.total_giveaways_count || 0),
      updated_at: r.updated_at,
      uuid: r.uuid,
    };

    const [giveawayRows] = await pool.query<RowDataPacket[]>(
      `SELECT
        g.id AS giveaway_id,
        g.uuid AS giveaway_uuid,
        g.title AS giveaway_title,
        g.status AS giveaway_status,
        g.type AS giveaway_type,
        CASE WHEN gba.id IS NOT NULL THEN 1 ELSE 0 END AS is_assigned,
        COALESCE(gba.is_active, 0) AS is_active
      FROM giveaways g
      LEFT JOIN giveaway_bank_accounts gba ON gba.giveaway_id = g.id AND gba.bank_account_id = ?
      ORDER BY FIELD(g.status, 'active', 'paused', 'draft', 'completed', 'cancelled'), g.id DESC`,
      [account.id]
    );

    const giveaways: BankAccountGiveawayAssignment[] = giveawayRows.map((g) => ({
      giveaway_id: g.giveaway_id,
      giveaway_status: g.giveaway_status,
      giveaway_title: g.giveaway_title,
      giveaway_type: g.giveaway_type,
      giveaway_uuid: g.giveaway_uuid,
      is_active: Boolean(g.is_active),
      is_assigned: Boolean(g.is_assigned),
    }));

    return { account, giveaways };
  } catch (error) {
    logger.db.error('Error al obtener detalle de cuenta bancaria:', error);
    return null;
  }
}

export async function createBankAccount(input: CreateBankAccountInput): Promise<BankAccountDetail> {
  const bankName = (input.bank_name || '').trim();
  const accountHolder = (input.account_holder || '').trim();
  const accountType = input.account_type || 'clabe';
  const rawClabe = (input.clabe || '').replace(/\s+/g, '').trim();
  const rawCard = (input.card_number || '').replace(/\s+/g, '').trim();
  const rawAccountNumber = (input.account_number || '').trim();
  const currency = (input.currency || 'MXN').toUpperCase();
  const isActive = input.is_active !== undefined ? (input.is_active ? 1 : 0) : 1;

  if (!bankName) {
    throw new Error('El nombre del banco o institución financiera es obligatorio.');
  }
  if (!accountHolder) {
    throw new Error('El nombre del titular de la cuenta es obligatorio.');
  }
  if (!['clabe', 'card', 'both'].includes(accountType)) {
    throw new Error('El tipo de cuenta no es válido. Opciones permitidas: clabe, card, both.');
  }

  if (accountType === 'clabe' || accountType === 'both') {
    if (!rawClabe || rawClabe.length !== 18 || !/^\d{18}$/.test(rawClabe)) {
      throw new Error('La CLABE interbancaria debe contener exactamente 18 dígitos numéricos.');
    }
  }

  if (accountType === 'card' || accountType === 'both') {
    if (rawCard && (!/^\d{15,16}$/.test(rawCard))) {
      throw new Error('El número de tarjeta debe contener 15 o 16 dígitos numéricos.');
    }
  }

  const accountUuid = crypto.randomUUID();

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [insertResult] = await connection.query<ResultSetHeader>(
      `INSERT INTO bank_accounts (uuid, bank_name, account_holder, account_type, clabe, card_number, account_number, currency, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        accountUuid,
        bankName,
        accountHolder,
        accountType,
        rawClabe || null,
        rawCard || null,
        rawAccountNumber || null,
        currency,
        isActive,
      ]
    );

    const newAccountId = insertResult.insertId;

    if (input.apply_to_all_active_giveaways) {
      await connection.query(
        `INSERT INTO giveaway_bank_accounts (giveaway_id, bank_account_id, is_active)
         SELECT id, ?, 1 FROM giveaways WHERE status IN ('active', 'paused', 'draft')
         ON DUPLICATE KEY UPDATE is_active = 1`,
        [newAccountId]
      );
    } else if (Array.isArray(input.giveaway_ids) && input.giveaway_ids.length > 0) {
      const values = input.giveaway_ids.map((gId) => [gId, newAccountId, 1]);
      await connection.query(
        `INSERT INTO giveaway_bank_accounts (giveaway_id, bank_account_id, is_active)
         VALUES ?
         ON DUPLICATE KEY UPDATE is_active = 1`,
        [values]
      );
    }

    await connection.commit();
    await invalidateBankAccountsCache();

    const created = await getBankAccountByUuid(accountUuid);
    if (!created) {
      throw new Error('No se pudo recuperar la cuenta bancaria recién creada.');
    }
    return created.account;
  } catch (err: any) {
    await connection.rollback();
    if (err.code === 'ER_DUP_ENTRY') {
      throw new Error('Ya existe una cuenta registrada con esa misma CLABE interbancaria.');
    }
    logger.db.error('Error al insertar cuenta bancaria:', err);
    throw err;
  } finally {
    connection.release();
  }
}

export async function updateBankAccount(uuid: string, input: UpdateBankAccountInput): Promise<BankAccountDetail> {
  const existing = await getBankAccountByUuid(uuid);
  if (!existing) {
    throw new Error('La cuenta bancaria solicitada no existe.');
  }

  const bankName = input.bank_name !== undefined ? input.bank_name.trim() : existing.account.bank_name;
  const accountHolder = input.account_holder !== undefined ? input.account_holder.trim() : existing.account.account_holder;
  const accountType = input.account_type || existing.account.account_type;
  const rawClabe = input.clabe !== undefined ? (input.clabe ? input.clabe.replace(/\s+/g, '').trim() : null) : existing.account.clabe;
  const rawCard = input.card_number !== undefined ? (input.card_number ? input.card_number.replace(/\s+/g, '').trim() : null) : existing.account.card_number;
  const rawAccountNumber = input.account_number !== undefined ? (input.account_number ? input.account_number.trim() : null) : existing.account.account_number;
  const currency = (input.currency || existing.account.currency || 'MXN').toUpperCase();
  const isActive = input.is_active !== undefined ? (input.is_active ? 1 : 0) : existing.account.is_active;

  if (!bankName) {
    throw new Error('El nombre del banco no puede estar vacío.');
  }
  if (!accountHolder) {
    throw new Error('El titular de la cuenta no puede estar vacío.');
  }

  if (accountType === 'clabe' || accountType === 'both') {
    if (!rawClabe || rawClabe.length !== 18 || !/^\d{18}$/.test(rawClabe)) {
      throw new Error('La CLABE interbancaria debe contener 18 dígitos numéricos.');
    }
  }

  if (accountType === 'card' || accountType === 'both') {
    if (rawCard && !/^\d{15,16}$/.test(rawCard)) {
      throw new Error('El número de tarjeta debe contener 15 o 16 dígitos.');
    }
  }

  try {
    await pool.query(
      `UPDATE bank_accounts
       SET bank_name = ?, account_holder = ?, account_type = ?, clabe = ?, card_number = ?, account_number = ?, currency = ?, is_active = ?
       WHERE uuid = ?`,
      [
        bankName,
        accountHolder,
        accountType,
        rawClabe || null,
        rawCard || null,
        rawAccountNumber || null,
        currency,
        isActive,
        uuid,
      ]
    );

    await invalidateBankAccountsCache();

    const updated = await getBankAccountByUuid(uuid);
    if (!updated) {
      throw new Error('No se pudo recuperar la cuenta bancaria actualizada.');
    }
    return updated.account;
  } catch (err: any) {
    if (err.code === 'ER_DUP_ENTRY') {
      throw new Error('Ya existe otra cuenta registrada con esa misma CLABE interbancaria.');
    }
    logger.db.error('Error al actualizar cuenta bancaria:', err);
    throw err;
  }
}

export async function toggleBankAccountStatus(uuid: string, isActive: boolean): Promise<BankAccountDetail> {
  const existing = await getBankAccountByUuid(uuid);
  if (!existing) {
    throw new Error('La cuenta bancaria solicitada no existe.');
  }

  const nextStatus = isActive ? 1 : 0;
  await pool.query(
    `UPDATE bank_accounts SET is_active = ? WHERE uuid = ?`,
    [nextStatus, uuid]
  );

  await invalidateBankAccountsCache();

  const updated = await getBankAccountByUuid(uuid);
  if (!updated) {
    throw new Error('No se pudo recuperar la cuenta bancaria.');
  }
  return updated.account;
}

export async function updateBankAccountGiveaways(
  uuid: string,
  assignments: Array<{ giveawayId: number; isActive: boolean }>
): Promise<BankAccountGiveawayAssignment[]> {
  const existing = await getBankAccountByUuid(uuid);
  if (!existing) {
    throw new Error('La cuenta bancaria solicitada no existe.');
  }

  const accountId = existing.account.id;
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    for (const item of assignments) {
      const gId = Number(item.giveawayId);
      const isAct = item.isActive ? 1 : 0;

      await connection.query(
        `INSERT INTO giveaway_bank_accounts (giveaway_id, bank_account_id, is_active)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE is_active = ?`,
        [gId, accountId, isAct, isAct]
      );
    }

    await connection.commit();
    await invalidateBankAccountsCache();

    const fresh = await getBankAccountByUuid(uuid);
    return fresh?.giveaways || [];
  } catch (err) {
    await connection.rollback();
    logger.db.error('Error al actualizar asignaciones de cuenta bancaria a sorteos:', err);
    throw err;
  } finally {
    connection.release();
  }
}

export async function deleteBankAccount(uuid: string): Promise<void> {
  const existing = await getBankAccountByUuid(uuid);
  if (!existing) {
    throw new Error('La cuenta bancaria solicitada no existe.');
  }

  try {
    await pool.query(`DELETE FROM bank_accounts WHERE uuid = ?`, [uuid]);
    await invalidateBankAccountsCache();
  } catch (err) {
    logger.db.error('Error al eliminar cuenta bancaria:', err);
    throw err;
  }
}
