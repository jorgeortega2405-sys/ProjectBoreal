import { approveOrderHandler, cancelOrderHandler, getOrderReceiptHandler, getOrdersHandler, getSpeiQueueHandler, triggerSpeiBatchHandler } from '../controllers/orders.controller.js';
import { requireAdminAuth, requirePermission } from '../middlewares/auth.middleware.js';
import { Router } from 'express';

const router = Router();

router.use(requireAdminAuth);

router.get('/', requirePermission('orders:view'), getOrdersHandler);
router.get('/spei-queue', requirePermission('orders:review'), getSpeiQueueHandler);
router.post('/spei-queue/trigger', requirePermission('orders:review'), triggerSpeiBatchHandler);
router.get('/:uuid/receipt', requirePermission('orders:view'), getOrderReceiptHandler);
router.put('/:uuid/approve', requirePermission('orders:review'), approveOrderHandler);
router.put('/:uuid/cancel', requirePermission('orders:review'), cancelOrderHandler);

export default router;
