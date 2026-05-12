import { Router } from 'express';
import * as watchlistController from './watchlist.controller';
import { authenticate } from '../../middleware/auth.middleware';

const router = Router();

router.use(authenticate);

router.get('/', watchlistController.getWatchlist);
router.post('/', watchlistController.addToWatchlist);
router.delete('/:auctionId', watchlistController.removeFromWatchlist);

export default router;
