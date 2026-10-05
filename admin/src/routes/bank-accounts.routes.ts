import { createBankAccountHandler, deleteBankAccountHandler, getBankAccountsHandler, getGiveawaysForAssignmentHandler, toggleBankAccountHandler, updateBankAccountHandler } from '../controllers/bank-accounts.controller.js';
import { requireAdminAuth, requirePermission } from '../middlewares/auth.middleware.js';
import { Router } from 'express';

const router = Router();

router.use(requireAdminAuth);

router.get('/', getBankAccountsHandler);
router.get('/giveaways', getGiveawaysForAssignmentHandler);
router.post('/', requirePermission('bank_accounts:manage'), createBankAccountHandler);
router.put('/:uuid', requirePermission('bank_accounts:manage'), updateBankAccountHandler);
router.patch('/:uuid/toggle', requirePermission('bank_accounts:manage'), toggleBankAccountHandler);
router.delete('/:uuid', requirePermission('bank_accounts:manage'), deleteBankAccountHandler);

export default router;
