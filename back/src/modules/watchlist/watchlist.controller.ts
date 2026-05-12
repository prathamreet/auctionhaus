import { Response, NextFunction } from 'express';
import { z } from 'zod';
import * as watchlistService from './watchlist.service';
import { AuthRequest } from '../../middleware/auth.middleware';

export const getWatchlist = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const items = await watchlistService.getWatchlist(req.user!.id);
    res.json({ watchlist: items });
  } catch (err) {
    next(err);
  }
};

export const addToWatchlist = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { auctionId } = z.object({ auctionId: z.string().uuid() }).parse(req.body);
    const item = await watchlistService.addToWatchlist(req.user!.id, auctionId);
    res.status(201).json(item);
  } catch (err) {
    next(err);
  }
};

export const removeFromWatchlist = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const result = await watchlistService.removeFromWatchlist(req.user!.id, req.params.auctionId);
    res.json(result);
  } catch (err) {
    next(err);
  }
};
