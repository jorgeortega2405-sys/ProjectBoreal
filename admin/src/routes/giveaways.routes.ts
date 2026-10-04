import { createGiveawayHandler, getGiveawayDetailHandler, listGiveaways, updateGiveawayHandler } from '../controllers/giveaways.controller.js';
import { requireAdminAuth } from '../middlewares/auth.middleware.js';
import { Router } from 'express';

const router = Router();

router.get('/', requireAdminAuth, listGiveaways);
router.post('/', requireAdminAuth, createGiveawayHandler);
router.get('/:uuid', requireAdminAuth, getGiveawayDetailHandler);
router.put('/:uuid', requireAdminAuth, updateGiveawayHandler);

export default router;
