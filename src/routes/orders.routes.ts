import { getBankAccountsHandler, getOrderDetailHandler, getOrderReceiptHandler, lookupOrdersHandler, reserveOrderHandler, uploadReceiptHandler } from '../controllers/orders.controller.js';
import { createRateLimiter } from '../middlewares/rate-limit.middleware.js';
import { Router } from 'express';

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

const detailLimiter = createRateLimiter({
  keyPrefix: 'order_detail',
  maxRequests: 30,
  windowSeconds: 60,
});

const receiptLimiter = createRateLimiter({
  keyPrefix: 'order_receipt',
  maxRequests: 10,
  windowSeconds: 60,
});

router.post('/reserve', reserveLimiter, reserveOrderHandler);
router.post('/lookup', lookupLimiter, lookupOrdersHandler);
router.post('/upload-receipt', uploadLimiter, uploadReceiptHandler);
router.get('/bank-accounts', getBankAccountsHandler);
router.get('/:uuid', detailLimiter, getOrderDetailHandler);
router.get('/:uuid/receipt', receiptLimiter, getOrderReceiptHandler);

export default router;

