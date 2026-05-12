import { Router } from 'express';
import * as notificationController from './notification.controller';
import { authenticate } from '../../middleware/auth.middleware';

const router = Router();

router.use(authenticate);

router.get('/', notificationController.getNotifications);
router.put('/read-all', notificationController.markAllRead);
router.delete('/all', notificationController.deleteAllNotifications);
router.put('/:id/read', notificationController.markRead);
router.delete('/:id', notificationController.deleteNotification);

export default router;
