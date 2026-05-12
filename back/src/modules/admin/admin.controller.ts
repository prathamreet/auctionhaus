import { Response, NextFunction } from 'express';
import { z } from 'zod';
import { AuctionStatus } from '@prisma/client';
import * as adminService from './admin.service';
import { AuthRequest } from '../../middleware/auth.middleware';

export const getDashboard = async (_req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const stats = await adminService.getDashboardStats();
    res.json(stats);
  } catch (err) {
    next(err);
  }
};

export const getAllUsers = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const schema = z.object({
      page: z.coerce.number().int().positive().default(1),
      limit: z.coerce.number().int().positive().max(100).default(20),
      search: z.string().optional(),
    });
    const params = schema.parse(req.query);
    const result = await adminService.getAllUsers(params);
    res.json(result);
  } catch (err) {
    next(err);
  }
};

export const suspendUser = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { suspend } = z.object({ suspend: z.boolean() }).parse(req.body);
    const user = await adminService.suspendUser(req.params.userId, suspend);
    res.json(user);
  } catch (err) {
    next(err);
  }
};

export const getAllAuctions = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const schema = z.object({
      page: z.coerce.number().int().positive().default(1),
      limit: z.coerce.number().int().positive().max(100).default(20),
      status: z.nativeEnum(AuctionStatus).optional(),
    });
    const params = schema.parse(req.query);
    const result = await adminService.getAllAuctions(params);
    res.json(result);
  } catch (err) {
    next(err);
  }
};

export const moderateAuction = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { action } = z.object({ action: z.enum(['cancel', 'activate']) }).parse(req.body);
    const auction = await adminService.moderateAuction(req.params.auctionId, action);
    res.json(auction);
  } catch (err) {
    next(err);
  }
};

export const getFraudFlags = async (_req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const flags = await adminService.getFraudFlags();
    res.json({ flags });
  } catch (err) {
    next(err);
  }
};
