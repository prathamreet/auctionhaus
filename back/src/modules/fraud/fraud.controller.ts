import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authenticate, requireAdmin, AuthRequest } from '../../middleware/auth.middleware';
import * as fraudService from './fraud.service';

const router = Router();

// All fraud endpoints require an authenticated admin
router.use(authenticate, requireAdmin);

// GET /api/fraud/flags
router.get('/flags', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const query = z.object({
      dismissed: z.coerce.boolean().optional().default(false),
      limit: z.coerce.number().int().positive().max(200).optional().default(50),
      auctionId: z.string().uuid().optional(),
      bidderId: z.string().uuid().optional(),
    }).parse(req.query);

    const flags = await fraudService.getFraudFlags(query);
    res.json({ flags });
  } catch (err) {
    next(err);
  }
});

// GET /api/fraud/stats
router.get('/stats', async (_req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const stats = await fraudService.getFraudStats();
    res.json(stats);
  } catch (err) {
    next(err);
  }
});

// PUT /api/fraud/flags/:id/dismiss
router.put('/flags/:id/dismiss', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const flag = await fraudService.dismissFlag(req.params.id);
    res.json({ flag });
  } catch (err) {
    next(err);
  }
});

export default router;
