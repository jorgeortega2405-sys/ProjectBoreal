import { getAuditLogDetailHandler, getAuditLogsHandler } from '../controllers/audit.controller.js';
import { requireAdminAuth, requirePermission } from '../middlewares/auth.middleware.js';
import { Router } from 'express';

const router = Router();

router.use(requireAdminAuth);
router.use(requirePermission('audit:view'));

router.get('/', getAuditLogsHandler);
router.get('/:uuid', getAuditLogDetailHandler);

export default router;
