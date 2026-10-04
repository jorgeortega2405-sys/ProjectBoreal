import { createBankAccountHandler, deleteBankAccountHandler, getBankAccountsHandler, getGiveawaysForAssignmentHandler, toggleBankAccountHandler, updateBankAccountHandler } from '../controllers/bank-accounts.controller.js';
import { requireAdminAuth } from '../middlewares/auth.middleware.js';
import { Router } from 'express';

const router = Router();

router.use(requireAdminAuth);

router.get('/', getBankAccountsHandler);
router.get('/giveaways', getGiveawaysForAssignmentHandler);
router.post('/', createBankAccountHandler);
router.put('/:uuid', updateBankAccountHandler);
router.patch('/:uuid/toggle', toggleBankAccountHandler);
router.delete('/:uuid', deleteBankAccountHandler);

export default router;
