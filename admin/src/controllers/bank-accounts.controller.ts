import { AuthenticatedAdminRequest } from '../types/auth.types.js';
import { createAdminBankAccount, deleteAdminBankAccount, getAdminBankAccounts, getGiveawaysForAssignment, toggleAdminBankAccount, updateAdminBankAccount } from '../services/bank-accounts.service.js';
import { logger } from '../services/logger.service.js';
import { Response } from 'express';

export async function getBankAccountsHandler(_req: AuthenticatedAdminRequest, res: Response): Promise<void> {
  try {
    const accounts = await getAdminBankAccounts();
    res.status(200).json({ accounts, success: true });
  } catch (error) {
    logger.app.error('Error en getBankAccountsHandler', error);
    res.status(500).json({ error: 'Ha ocurrido un error al obtener las cuentas bancarias.' });
  }
}

export async function getGiveawaysForAssignmentHandler(_req: AuthenticatedAdminRequest, res: Response): Promise<void> {
  try {
    const giveaways = await getGiveawaysForAssignment();
    res.status(200).json({ giveaways, success: true });
  } catch (error) {
    logger.app.error('Error en getGiveawaysForAssignmentHandler', error);
    res.status(500).json({ error: 'Ha ocurrido un error al obtener la lista de sorteos.' });
  }
}

export async function createBankAccountHandler(req: AuthenticatedAdminRequest, res: Response): Promise<void> {
  try {
    const { account_holder, account_number, account_type, bank_name, card_number, clabe, currency, giveaway_ids, is_active } = req.body || {};

    if (!bank_name || typeof bank_name !== 'string' || !bank_name.trim()) {
      res.status(400).json({ error: 'El nombre del banco es obligatorio.' });
      return;
    }

    if (!account_holder || typeof account_holder !== 'string' || !account_holder.trim()) {
      res.status(400).json({ error: 'El titular de la cuenta es obligatorio.' });
      return;
    }

    if (!account_type || !['clabe', 'card', 'both'].includes(account_type)) {
      res.status(400).json({ error: 'Tipo de cuenta inválido.' });
      return;
    }

    if (account_type === 'clabe' && (!clabe || clabe.trim().length !== 18)) {
      res.status(400).json({ error: 'La CLABE interbancaria debe tener exactamente 18 dígitos.' });
      return;
    }

    if (account_type === 'card' && (!card_number || card_number.trim().length < 15)) {
      res.status(400).json({ error: 'El número de tarjeta debe tener entre 15 y 16 dígitos.' });
      return;
    }

    const created = await createAdminBankAccount({
      account_holder,
      account_number,
      account_type,
      bank_name,
      card_number,
      clabe,
      currency,
      giveaway_ids,
      is_active,
    });

    res.status(201).json({ account: created, message: 'Cuenta bancaria registrada exitosamente.', success: true });
  } catch (error) {
    logger.app.error('Error en createBankAccountHandler', error);
    const msg = error instanceof Error ? error.message : 'Error al registrar la cuenta bancaria.';
    res.status(400).json({ error: msg });
  }
}

export async function updateBankAccountHandler(req: AuthenticatedAdminRequest, res: Response): Promise<void> {
  const { uuid } = req.params;
  if (!uuid) {
    res.status(400).json({ error: 'Identificador de cuenta requerido.' });
    return;
  }

  try {
    await updateAdminBankAccount(uuid, req.body || {});
    res.status(200).json({ message: 'Cuenta bancaria actualizada exitosamente.', success: true });
  } catch (error) {
    logger.app.error(`Error al actualizar cuenta bancaria ${uuid}`, error);
    const msg = error instanceof Error ? error.message : 'Error al actualizar la cuenta bancaria.';
    res.status(400).json({ error: msg });
  }
}

export async function toggleBankAccountHandler(req: AuthenticatedAdminRequest, res: Response): Promise<void> {
  const { uuid } = req.params;
  if (!uuid) {
    res.status(400).json({ error: 'Identificador de cuenta requerido.' });
    return;
  }

  try {
    const isActive = Boolean(req.body?.is_active);
    await toggleAdminBankAccount(uuid, isActive);
    res.status(200).json({
      message: `Cuenta bancaria ${isActive ? 'activada' : 'desactivada'} exitosamente.`,
      success: true,
    });
  } catch (error) {
    logger.app.error(`Error al conmutar estado de cuenta ${uuid}`, error);
    res.status(400).json({ error: 'Error al cambiar el estado de la cuenta bancaria.' });
  }
}

export async function deleteBankAccountHandler(req: AuthenticatedAdminRequest, res: Response): Promise<void> {
  const { uuid } = req.params;
  if (!uuid) {
    res.status(400).json({ error: 'Identificador de cuenta requerido.' });
    return;
  }

  try {
    await deleteAdminBankAccount(uuid);
    res.status(200).json({ message: 'Cuenta bancaria eliminada exitosamente.', success: true });
  } catch (error) {
    logger.app.error(`Error al eliminar cuenta bancaria ${uuid}`, error);
    res.status(400).json({ error: 'Error al eliminar la cuenta bancaria.' });
  }
}
