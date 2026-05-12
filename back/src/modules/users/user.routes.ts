import { Router } from 'express';
import * as userController from './user.controller';
import { authenticate } from '../../middleware/auth.middleware';

const router = Router();

router.use(authenticate);

router.get('/me', userController.getProfile);
router.put('/me', userController.updateProfile);
router.get('/me/bids', userController.getBidHistory);
router.get('/me/auctions', userController.getMyAuctions);
router.get('/me/won', userController.getWonAuctions);
router.post('/rate', userController.rateUser);
router.get('/:id', userController.getProfile);

export default router;
