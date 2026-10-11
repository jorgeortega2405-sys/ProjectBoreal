import { approveOrderHandler, exportReconciliationCsvHandler, getOrderDetailHandler, getOrderReceiptHandler, getOrdersHandler, getPaymentKpisHandler, getReconciliationHandler, rejectOrderHandler, retrySpeiHandler, updateTrackingKeyHandler } from '../controllers/orders.controller.js';
import { requirePermission } from '../middlewares/auth.middleware.js';
import { Router } from 'express';

const router = Router();

router.get('/', requirePermission('orders:read', 'orders:approve', 'orders:reject', 'orders:manage'), getOrdersHandler);
router.get('/kpis', requirePermission('orders:read', 'orders:approve', 'orders:reject', 'orders:manage'), getPaymentKpisHandler);
router.get('/reconciliation/summary', requirePermission('orders:read'), getReconciliationHandler);
router.get('/reconciliation/export', requirePermission('orders:read'), exportReconciliationCsvHandler);
router.get('/:uuid', requirePermission('orders:read', 'orders:approve', 'orders:reject', 'orders:manage'), getOrderDetailHandler);
router.get('/:uuid/receipt', requirePermission('orders:read', 'orders:approve', 'orders:reject', 'orders:manage'), getOrderReceiptHandler);
router.post('/:uuid/approve', requirePermission('orders:approve'), approveOrderHandler);
router.post('/:uuid/reject', requirePermission('orders:reject'), rejectOrderHandler);
router.post('/:uuid/retry-spei', requirePermission('orders:manage'), retrySpeiHandler);
router.patch('/:uuid/tracking-key', requirePermission('orders:manage'), updateTrackingKeyHandler);

export default router;
