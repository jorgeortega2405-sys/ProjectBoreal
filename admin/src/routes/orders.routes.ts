import { approveOrderHandler, cancelOrderHandler, getOrderReceiptHandler, getOrdersHandler, getSpeiQueueHandler, triggerSpeiBatchHandler } from '../controllers/orders.controller.js';
import { requireAdminAuth } from '../middlewares/auth.middleware.js';
import { Router } from 'express';

const router = Router();

router.use(requireAdminAuth);

router.get('/', getOrdersHandler);
router.get('/spei-queue', getSpeiQueueHandler);
router.post('/spei-queue/trigger', triggerSpeiBatchHandler);
router.get('/:uuid/receipt', getOrderReceiptHandler);
router.put('/:uuid/approve', approveOrderHandler);
router.put('/:uuid/cancel', cancelOrderHandler);

export default router;
