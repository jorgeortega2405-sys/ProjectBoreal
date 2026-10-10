import { approveOrderHandler, getOrderDetailHandler, getOrderReceiptHandler, getOrdersHandler, getPaymentKpisHandler, rejectOrderHandler, updateTrackingKeyHandler } from '../controllers/orders.controller.js';
import { requirePermission } from '../middlewares/auth.middleware.js';
import { Router } from 'express';

const router = Router();

router.get('/', requirePermission('orders:read', 'orders:approve', 'orders:reject', 'orders:manage'), getOrdersHandler);
router.get('/kpis', requirePermission('orders:read', 'orders:approve', 'orders:reject', 'orders:manage'), getPaymentKpisHandler);
router.get('/:uuid', requirePermission('orders:read', 'orders:approve', 'orders:reject', 'orders:manage'), getOrderDetailHandler);
router.get('/:uuid/receipt', requirePermission('orders:read', 'orders:approve', 'orders:reject', 'orders:manage'), getOrderReceiptHandler);
router.post('/:uuid/approve', requirePermission('orders:approve'), approveOrderHandler);
router.post('/:uuid/reject', requirePermission('orders:reject'), rejectOrderHandler);
router.patch('/:uuid/tracking-key', requirePermission('orders:manage'), updateTrackingKeyHandler);

export default router;
