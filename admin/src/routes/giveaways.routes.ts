import { createGiveawayHandler, getGiveawayDetailHandler, listGiveaways, updateGiveawayHandler } from '../controllers/giveaways.controller.js';
import { requireAdminAuth, requirePermission } from '../middlewares/auth.middleware.js';
import { Router } from 'express';

const router = Router();

router.get('/', requireAdminAuth, listGiveaways);
router.post('/', requireAdminAuth, requirePermission('lottery:create'), createGiveawayHandler);
router.get('/:uuid', requireAdminAuth, getGiveawayDetailHandler);
router.put('/:uuid', requireAdminAuth, requirePermission('lottery:edit'), updateGiveawayHandler);

export default router;
