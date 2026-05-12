import { Router } from 'express';
import * as walletController from './wallet.controller';
import { authenticate } from '../../middleware/auth.middleware';

const router = Router();

router.use(authenticate);

router.get('/', walletController.getWallet);
router.post('/deposit', walletController.deposit);
router.post('/withdraw', walletController.withdraw);
router.get('/transactions', walletController.getTransactions);

export default router;
