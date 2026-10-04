import { getDashboardStatsHandler } from '../controllers/dashboard.controller.js';
import { requireAdminAuth } from '../middlewares/auth.middleware.js';
import { Router } from 'express';

const router = Router();

router.use(requireAdminAuth);

router.get('/stats', getDashboardStatsHandler);

export default router;
