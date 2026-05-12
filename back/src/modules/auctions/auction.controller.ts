import { Response, NextFunction } from 'express';
import { z } from 'zod';
import { AuctionType, AuctionStatus } from '@prisma/client';
import * as auctionService from './auction.service';
import { AuthRequest } from '../../middleware/auth.middleware';
import { createError } from '../../middleware/error.middleware';

const createAuctionSchema = z.object({
  title: z.string().min(3).max(200),
  description: z.string().min(10),
  imageUrl: z.string().url().optional(),
  type: z.nativeEnum(AuctionType).default('ENGLISH'),
  startingPrice: z.number().positive(),
  reservePrice: z.number().positive().optional(),
  buyNowPrice: z.number().positive().optional(),
  dutchPriceStep: z.number().positive().optional(),
  dutchInterval: z.number().int().positive().optional(),
  minIncrement: z.number().positive().default(1),
  antiSnipingMins: z.number().int().min(0).max(30).default(5),
  startTime: z.string().datetime().optional(),
  endTime: z.string().datetime().optional(),
});

export const createAuction = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const data = createAuctionSchema.parse(req.body);
    const startTime = data.startTime ? new Date(data.startTime) : new Date();
    let endTime: Date;

    if (data.type === 'DUTCH' && !data.endTime) {
      if (!data.dutchPriceStep || !data.dutchInterval) {
        throw createError('Dutch auctions require price step and interval', 400);
      }
      const floor = data.reservePrice || 0;
      const drops = Math.ceil((data.startingPrice - floor) / data.dutchPriceStep);
      endTime = new Date(startTime.getTime() + drops * data.dutchInterval * 1000);
    } else {
      if (!data.endTime) throw createError('End time is required', 400);
      endTime = new Date(data.endTime);
    }

    const auction = await auctionService.createAuction(req.user!.id, {
      ...data,
      startTime,
      endTime,
    });
    res.status(201).json(auction);
  } catch (err) {
    next(err);
  }
};

export const getAuctions = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const schema = z.object({
      status: z.nativeEnum(AuctionStatus).optional(),
      type: z.nativeEnum(AuctionType).optional(),
      search: z.string().optional(),
      page: z.coerce.number().int().positive().default(1),
      limit: z.coerce.number().int().positive().max(100).default(20),
    });
    const params = schema.parse(req.query);
    const result = await auctionService.getAuctions(params);
    res.json(result);
  } catch (err) {
    next(err);
  }
};

export const getAuctionById = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const auction = await auctionService.getAuctionById(req.params.id, req.user?.id);
    res.json(auction);
  } catch (err) {
    next(err);
  }
};

export const updateAuction = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const schema = z.object({
      title: z.string().min(3).max(200).optional(),
      description: z.string().min(10).optional(),
      imageUrl: z.string().url().optional(),
    });
    const data = schema.parse(req.body);
    const auction = await auctionService.updateAuction(req.params.id, req.user!.id, data);
    res.json(auction);
  } catch (err) {
    next(err);
  }
};

export const cancelAuction = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const auction = await auctionService.cancelAuction(req.params.id, req.user!.id);
    res.json(auction);
  } catch (err) {
    next(err);
  }
};

export const buyNow = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const auction = await auctionService.buyNow(req.params.id, req.user!.id);
    // Emit socket event
    req.io?.to(`auction:${req.params.id}`).emit('auction:ended', {
      auctionId: req.params.id,
      winnerId: req.user!.id,
      reason: 'buy_now',
    });
    res.json(auction);
  } catch (err) {
    next(err);
  }
};
