import { blockCustomer, getAllCustomers, getCustomerDetail, getCustomersKpis, unblockCustomer } from '../services/customers.service.js';
import { logger } from '../services/logger.service.js';
import { getSafeErrorMessage } from '../utils/error.util.js';
import { Request, Response, Router } from 'express';

const router = Router();

router.get('/kpis', async (_req: Request, res: Response): Promise<void> => {
  try {
    const kpis = await getCustomersKpis();
    res.status(200).json({
      data: kpis,
      success: true,
    });
  } catch (err) {
    logger.app.error('Error al obtener KPIs de clientes en admin:', err);
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

    const customers = await getAllCustomers({ search, status });
    res.status(200).json({
      data: customers,
      success: true,
    });
  } catch (err) {
    logger.app.error('Error al listar clientes en admin:', err);
    res.status(500).json({
      error: 'Ha ocurrido un error inesperado al procesar la solicitud. Por favor intenta más tarde.',
      success: false,
    });
  }
});

router.get('/:phone', async (req: Request, res: Response): Promise<void> => {
  try {
    const { phone } = req.params;
    const data = await getCustomerDetail(phone);
    if (!data) {
      res.status(404).json({
        error: 'El cliente solicitado no fue encontrado.',
        success: false,
      });
      return;
    }
    res.status(200).json({
      data,
      success: true,
    });
  } catch (err) {
    logger.app.error('Error al obtener detalle del cliente en admin:', err);
    res.status(500).json({
      error: 'Ha ocurrido un error inesperado al procesar la solicitud. Por favor intenta más tarde.',
      success: false,
    });
  }
});

router.post('/:phone/block', async (req: Request, res: Response): Promise<void> => {
  try {
    const { phone } = req.params;
    const { customerName, reason } = req.body;
    await blockCustomer(phone, reason, customerName);
    res.status(200).json({
      message: 'Cliente agregado a la lista negra con éxito.',
      success: true,
    });
  } catch (err: any) {
    logger.app.warn('Error al bloquear cliente en admin:', err);
    res.status(400).json({
      error: getSafeErrorMessage(err, 'Error al bloquear cliente.'),
      success: false,
    });
  }
});

router.delete('/:phone/block', async (req: Request, res: Response): Promise<void> => {
  try {
    const { phone } = req.params;
    await unblockCustomer(phone);
    res.status(200).json({
      message: 'Cliente retirado de la lista negra con éxito.',
      success: true,
    });
  } catch (err: any) {
    logger.app.warn('Error al desbloquear cliente en admin:', err);
    res.status(400).json({
      error: getSafeErrorMessage(err, 'Error al desbloquear cliente.'),
      success: false,
    });
  }
});

export default router;
