import auditRoutes from './audit.routes.js';
import authRoutes from './auth.routes.js';
import bankAccountsRoutes from './bank-accounts.routes.js';
import dashboardRoutes from './dashboard.routes.js';
import giveawaysRoutes from './giveaways.routes.js';
import ordersRoutes from './orders.routes.js';
import { Router } from 'express';

const router = Router();

router.use('/audit', auditRoutes);
router.use('/auth', authRoutes);
router.use('/bank-accounts', bankAccountsRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/giveaways', giveawaysRoutes);
router.use('/orders', ordersRoutes);

export default router;


