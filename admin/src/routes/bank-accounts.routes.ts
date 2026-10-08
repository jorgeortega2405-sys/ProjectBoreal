import { createBankAccount, deleteBankAccount, getAllBankAccounts, getBankAccountByUuid, getBankAccountsKpis, toggleBankAccountStatus, updateBankAccount, updateBankAccountGiveaways } from '../services/bank-accounts.service.js';
import { logger } from '../services/logger.service.js';
import { Request, Response, Router } from 'express';

const router = Router();

router.get('/kpis', async (_req: Request, res: Response): Promise<void> => {
  try {
    const kpis = await getBankAccountsKpis();
    res.status(200).json({
      data: kpis,
      success: true,
    });
  } catch (err) {
    logger.app.error('Error al obtener KPIs de cuentas bancarias en admin:', err);
    res.status(500).json({
      error: 'Ha ocurrido un error inesperado al procesar la solicitud. Por favor intenta más tarde.',
      success: false,
    });
  }
});

router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const search = typeof req.query.search === 'string' ? req.query.search : undefined;
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;

    const accounts = await getAllBankAccounts({ search, status });
    res.status(200).json({
      data: accounts,
      success: true,
    });
  } catch (err) {
    logger.app.error('Error al listar cuentas bancarias en admin:', err);
    res.status(500).json({
      error: 'Ha ocurrido un error inesperado al procesar la solicitud. Por favor intenta más tarde.',
      success: false,
    });
  }
});

router.get('/:uuid', async (req: Request, res: Response): Promise<void> => {
  try {
    const { uuid } = req.params;
    const data = await getBankAccountByUuid(uuid);
    if (!data) {
      res.status(404).json({
        error: 'La cuenta bancaria solicitada no fue encontrada.',
        success: false,
      });
      return;
    }
    res.status(200).json({
      data,
      success: true,
    });
  } catch (err) {
    logger.app.error('Error al obtener detalle de cuenta bancaria en admin:', err);
    res.status(500).json({
      error: 'Ha ocurrido un error inesperado al procesar la solicitud. Por favor intenta más tarde.',
      success: false,
    });
  }
});

router.post('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const created = await createBankAccount(req.body);
    res.status(201).json({
      data: created,
      message: 'Cuenta bancaria registrada exitosamente.',
      success: true,
    });
  } catch (err: any) {
    logger.app.warn('Validación o error al crear cuenta bancaria en admin:', err?.message || err);
    res.status(400).json({
      error: err?.message || 'Error al validar los datos de la cuenta bancaria.',
      success: false,
    });
  }
});

router.put('/:uuid', async (req: Request, res: Response): Promise<void> => {
  try {
    const { uuid } = req.params;
    const updated = await updateBankAccount(uuid, req.body);
    res.status(200).json({
      data: updated,
      message: 'Cuenta bancaria actualizada exitosamente.',
      success: true,
    });
  } catch (err: any) {
    logger.app.warn('Validación o error al actualizar cuenta bancaria en admin:', err?.message || err);
    res.status(400).json({
      error: err?.message || 'Error al actualizar la cuenta bancaria.',
      success: false,
    });
  }
});

router.patch('/:uuid/status', async (req: Request, res: Response): Promise<void> => {
  try {
    const { uuid } = req.params;
    const { isActive } = req.body;
    if (typeof isActive !== 'boolean') {
      res.status(400).json({
        error: 'El campo isActive debe ser un valor booleano.',
        success: false,
      });
      return;
    }
    const updated = await toggleBankAccountStatus(uuid, isActive);
    res.status(200).json({
      data: updated,
      message: isActive ? 'Cuenta bancaria activada exitosamente.' : 'Cuenta bancaria pausada exitosamente.',
      success: true,
    });
  } catch (err: any) {
    logger.app.warn('Error al cambiar estado de cuenta bancaria en admin:', err?.message || err);
    res.status(400).json({
      error: err?.message || 'Error al modificar el estado de la cuenta.',
      success: false,
    });
  }
});

router.put('/:uuid/giveaways', async (req: Request, res: Response): Promise<void> => {
  try {
    const { uuid } = req.params;
    const { assignments } = req.body;
    if (!Array.isArray(assignments)) {
      res.status(400).json({
        error: 'La lista de asignaciones por sorteo no es válida.',
        success: false,
      });
      return;
    }
    const updatedGiveaways = await updateBankAccountGiveaways(uuid, assignments);
    res.status(200).json({
      data: updatedGiveaways,
      message: 'Cobertura de sorteos actualizada exitosamente.',
      success: true,
    });
  } catch (err: any) {
    logger.app.error('Error al actualizar asignaciones de sorteos en admin:', err);
    res.status(400).json({
      error: err?.message || 'Error al actualizar la cobertura de la cuenta en sorteos.',
      success: false,
    });
  }
});

router.delete('/:uuid', async (req: Request, res: Response): Promise<void> => {
  try {
    const { uuid } = req.params;
    await deleteBankAccount(uuid);
    res.status(200).json({
      message: 'Cuenta bancaria eliminada exitosamente.',
      success: true,
    });
  } catch (err: any) {
    logger.app.warn('Error al eliminar cuenta bancaria en admin:', err?.message || err);
    res.status(400).json({
      error: err?.message || 'No se pudo eliminar la cuenta bancaria.',
      success: false,
    });
  }
});

export default router;
