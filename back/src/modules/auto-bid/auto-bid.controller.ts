import { Response, NextFunction } from 'express';
import { z } from 'zod';
import * as autoBidService from './auto-bid.service';
import { AuthRequest } from '../../middleware/auth.middleware';

export const setAutoBid = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const schema = z.object({ maxAmount: z.number().positive() });
    const { maxAmount } = schema.parse(req.body);
    const autoBid = await autoBidService.setAutoBid({
      auctionId: req.params.auctionId,
      bidderId: req.user!.id,
      maxAmount,
    });
    res.status(201).json(autoBid);
  } catch (err) {
    next(err);
  }
};

export const cancelAutoBid = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const autoBid = await autoBidService.cancelAutoBid(req.params.auctionId, req.user!.id);
    res.json(autoBid);
  } catch (err) {
    next(err);
  }
};

export const getMyAutoBid = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const autoBid = await autoBidService.getMyAutoBid(req.params.auctionId, req.user!.id);
    res.json(autoBid || null);
  } catch (err) {
    next(err);
  }
};
