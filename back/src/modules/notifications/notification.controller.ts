import { Response, NextFunction } from 'express';
import { z } from 'zod';
import * as notificationService from './notification.service';
import { AuthRequest } from '../../middleware/auth.middleware';

export const getNotifications = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const schema = z.object({
      page: z.coerce.number().int().positive().default(1),
      limit: z.coerce.number().int().positive().max(100).default(20),
    });
    const { page, limit } = schema.parse(req.query);
    const result = await notificationService.getNotifications(req.user!.id, page, limit);
    res.json(result);
  } catch (err) {
    next(err);
  }
};

export const markRead = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id;
    const result = await notificationService.markRead(req.user!.id, id);
    res.json(result);
  } catch (err) {
    next(err);
  }
};

export const markAllRead = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const result = await notificationService.markRead(req.user!.id);
    res.json(result);
  } catch (err) {
    next(err);
  }
};

export const deleteNotification = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const result = await notificationService.deleteNotification(req.user!.id, req.params.id);
    res.json(result);
  } catch (err) {
    next(err);
  }
};

export const deleteAllNotifications = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const result = await notificationService.deleteAllNotifications(req.user!.id);
    res.json(result);
  } catch (err) {
    next(err);
  }
};
