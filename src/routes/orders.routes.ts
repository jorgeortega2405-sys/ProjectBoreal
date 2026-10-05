import { Router } from 'express';
import { getBankAccountsHandler, getOrderDetailHandler, getOrderReceiptHandler, lookupOrdersHandler, reserveOrderHandler, uploadReceiptHandler } from '../controllers/orders.controller.js';
import { createRateLimiter } from '../middlewares/rate-limit.middleware.js';

const router = Router();

const reserveLimiter = createRateLimiter({
  keyPrefix: 'reserve',
  maxRequests: 10,
  windowSeconds: 300,
});

const lookupLimiter = createRateLimiter({
  keyPrefix: 'lookup',
  maxRequests: 15,
  windowSeconds: 60,
});

const uploadLimiter = createRateLimiter({
  keyPrefix: 'upload',
  maxRequests: 10,
  windowSeconds: 300,
});

router.post('/reserve', reserveLimiter, reserveOrderHandler);
router.post('/lookup', lookupLimiter, lookupOrdersHandler);
router.post('/upload-receipt', uploadLimiter, uploadReceiptHandler);
router.get('/bank-accounts', getBankAccountsHandler);
router.get('/:uuid', getOrderDetailHandler);
router.get('/:uuid/receipt', getOrderReceiptHandler);

export default router;

