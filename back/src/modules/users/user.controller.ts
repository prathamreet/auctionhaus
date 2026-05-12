import { Response, NextFunction } from 'express';
import { z } from 'zod';
import * as userService from './user.service';
import { AuthRequest } from '../../middleware/auth.middleware';

export const getProfile = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.params.id || req.user!.id;
    const profile = await userService.getUserProfile(userId);
    res.json(profile);
  } catch (err) {
    next(err);
  }
};

export const updateProfile = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const schema = z.object({
      name: z.string().min(2).max(50).optional(),
      avatar: z.string().url().optional(),
    });
    const data = schema.parse(req.body);
    const user = await userService.updateProfile(req.user!.id, data);
    res.json(user);
  } catch (err) {
    next(err);
  }
};

export const getBidHistory = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const bids = await userService.getBidHistory(req.user!.id);
    res.json({ bids });
  } catch (err) {
    next(err);
  }
};

export const getMyAuctions = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const auctions = await userService.getMyAuctions(req.user!.id);
    res.json({ auctions });
  } catch (err) {
    next(err);
  }
};

export const getWonAuctions = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const auctions = await userService.getWonAuctions(req.user!.id);
    res.json({ auctions });
  } catch (err) {
    next(err);
  }
};

export const rateUser = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const schema = z.object({
      rateeId: z.string().uuid(),
      auctionId: z.string().uuid(),
      score: z.number().int().min(1).max(5),
      comment: z.string().max(500).optional(),
    });
    const data = schema.parse(req.body);
    const rating = await userService.rateUser({ ...data, raterId: req.user!.id });
    res.status(201).json(rating);
  } catch (err) {
    next(err);
  }
};
