import { getDailyGiveawayHandler, getDailyWinnersHandler, getGiveawayDetail, getGiveawayTicketsHandler, listActiveGiveaways, listWinnersHandler } from '../controllers/giveaways.controller.js';
import { createRateLimiter } from '../middlewares/rate-limit.middleware.js';
import { Router } from 'express';

const router = Router();

const giveawayListLimiter = createRateLimiter({
  keyPrefix: 'giveaways_list',
  maxRequests: 120,
  windowSeconds: 60,
});

const giveawayDetailLimiter = createRateLimiter({
  keyPrefix: 'giveaways_detail',
  maxRequests: 120,
  windowSeconds: 60,
});

router.get('/', giveawayListLimiter, listActiveGiveaways);
router.get('/daily', giveawayListLimiter, getDailyGiveawayHandler);
router.get('/daily/winners', giveawayListLimiter, getDailyWinnersHandler);
router.get('/winners', giveawayListLimiter, listWinnersHandler);
router.get('/:uuid/tickets', giveawayDetailLimiter, getGiveawayTicketsHandler);
router.get('/:uuid', giveawayDetailLimiter, getGiveawayDetail);

export default router;


