import { Router } from 'express';
import { getDashboardStatsHandler } from '../controllers/dashboard.controller.js';
import { requireAdminAuth, requirePermission } from '../middlewares/auth.middleware.js';

const router = Router();

router.use(requireAdminAuth);

router.get('/stats', requirePermission('audit:view'), getDashboardStatsHandler);

export default router;
