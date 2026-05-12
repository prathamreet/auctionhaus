import { Router } from 'express';
import * as auctionController from './auction.controller';
import { authenticate } from '../../middleware/auth.middleware';

const router = Router();

// Public routes
router.get('/', auctionController.getAuctions);
router.get('/:id', auctionController.getAuctionById);

// Protected routes
router.use(authenticate);
router.post('/', auctionController.createAuction);
router.put('/:id', auctionController.updateAuction);
router.delete('/:id', auctionController.cancelAuction);
router.post('/:id/buy-now', auctionController.buyNow);

export default router;
