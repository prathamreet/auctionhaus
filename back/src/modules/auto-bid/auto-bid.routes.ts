import { Router } from 'express';
import * as autoBidController from './auto-bid.controller';
import { authenticate } from '../../middleware/auth.middleware';

const router = Router({ mergeParams: true });

router.use(authenticate);

router.get('/auctions/:auctionId/auto-bid', autoBidController.getMyAutoBid);
router.post('/auctions/:auctionId/auto-bid', autoBidController.setAutoBid);
router.delete('/auctions/:auctionId/auto-bid', autoBidController.cancelAutoBid);

export default router;
