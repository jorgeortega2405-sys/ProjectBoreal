import { getAdminHealthStatus } from '../controllers/health.controller.js';
import { Router } from 'express';

const router = Router();

router.get('/', getAdminHealthStatus);

export default router;
