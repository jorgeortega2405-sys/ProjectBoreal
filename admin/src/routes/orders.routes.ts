import { approveOrderHandler, getOrderDetailHandler, getOrderReceiptHandler, getOrdersHandler, getPaymentKpisHandler, rejectOrderHandler, updateTrackingKeyHandler } from '../controllers/orders.controller.js';
import { Router } from 'express';

const router = Router();

router.get('/', getOrdersHandler);
router.get('/kpis', getPaymentKpisHandler);
router.get('/:uuid', getOrderDetailHandler);
router.get('/:uuid/receipt', getOrderReceiptHandler);
router.post('/:uuid/approve', approveOrderHandler);
router.post('/:uuid/reject', rejectOrderHandler);
router.patch('/:uuid/tracking-key', updateTrackingKeyHandler);

export default router;
