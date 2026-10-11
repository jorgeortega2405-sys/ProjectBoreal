import { getSettingsHandler, updateSettingsHandler } from '../controllers/settings.controller.js';
import { requirePermission } from '../middlewares/auth.middleware.js';
import { Router } from 'express';

const router = Router();

router.get('/', requirePermission('settings:read', 'giveaways:manage'), getSettingsHandler);
router.patch('/', requirePermission('settings:manage', 'giveaways:manage'), updateSettingsHandler);

export default router;
