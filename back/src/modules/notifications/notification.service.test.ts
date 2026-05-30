/* eslint-disable @typescript-eslint/no-explicit-any */
import { notifyUser, getNotifications, markRead, deleteNotification, deleteAllNotifications } from './notification.service';
import { prismaMock } from '../../__mocks__/prisma';
import { notificationQueue } from '../../queues/auction.queue';
import { io } from '../../index';

jest.mock('../../index', () => ({
  io: {
    to: jest.fn().mockReturnThis(),
    emit: jest.fn(),
  },
}));

describe('Notification Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('notifyUser', () => {
    it('should enqueue notification onto the BullMQ queue', async () => {
      await notifyUser('u1', {
        type: 'OUTBID',
        title: 'Hello',
        message: 'World',
        data: { test: true }
      });

      expect(notificationQueue.add).toHaveBeenCalledWith('deliver', {
        userId: 'u1',
        type: 'OUTBID',
        title: 'Hello',
        message: 'World',
        data: { test: true }
      });
    });

    it('should silently catch errors and log them', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      (notificationQueue.add as jest.Mock).mockRejectedValueOnce(new Error('Queue Error'));

      await expect(notifyUser('u1', { type: 'OUTBID', title: '', message: '' })).resolves.not.toThrow();
      expect(consoleSpy).toHaveBeenCalledWith('Failed to enqueue notification:', expect.any(Error));
      
      consoleSpy.mockRestore();
    });
  });

  describe('getNotifications', () => {
    it('should return paginated notifications and unread count', async () => {
      prismaMock.notification.findMany.mockResolvedValue([{ id: 'n1' }] as any);
      prismaMock.notification.count.mockResolvedValueOnce(1); // total
      prismaMock.notification.count.mockResolvedValueOnce(0); // unread

      const res = await getNotifications('u1', 1, 10);

      expect(res.notifications).toEqual([{ id: 'n1' }]);
      expect(res.total).toBe(1);
      expect(res.unreadCount).toBe(0);
      expect(res.page).toBe(1);
    });
  });

  describe('markRead', () => {
    it('should mark a specific notification as read', async () => {
      prismaMock.notification.findUnique.mockResolvedValue({ id: 'n1', userId: 'u1' } as any);
      prismaMock.notification.update.mockResolvedValue({ id: 'n1', isRead: true } as any);

      await markRead('u1', 'n1');

      expect(prismaMock.notification.update).toHaveBeenCalledWith({
        where: { id: 'n1' },
        data: { isRead: true }
      });
    });

    it('should throw if notification not found or unauthorized', async () => {
      prismaMock.notification.findUnique.mockResolvedValue(null);
      await expect(markRead('u1', 'n1')).rejects.toThrow('Notification not found');

      prismaMock.notification.findUnique.mockResolvedValue({ id: 'n1', userId: 'u2' } as any);
      await expect(markRead('u1', 'n1')).rejects.toThrow('Not authorized');
    });

    it('should mark all as read if no ID provided', async () => {
      prismaMock.notification.updateMany.mockResolvedValue({ count: 5 } as any);

      const res = await markRead('u1');

      expect(prismaMock.notification.updateMany).toHaveBeenCalledWith({
        where: { userId: 'u1', isRead: false },
        data: { isRead: true }
      });
      expect(res.message).toBe('All notifications marked as read');
    });
  });

  describe('deleteNotification', () => {
    it('should delete a notification', async () => {
      prismaMock.notification.findUnique.mockResolvedValue({ id: 'n1', userId: 'u1' } as any);
      
      await deleteNotification('u1', 'n1');

      expect(prismaMock.notification.delete).toHaveBeenCalledWith({ where: { id: 'n1' } });
    });

    it('should throw if unauthorized or missing', async () => {
      prismaMock.notification.findUnique.mockResolvedValue({ id: 'n1', userId: 'u2' } as any);
      await expect(deleteNotification('u1', 'n1')).rejects.toThrow('Not authorized');
    });
  });

  describe('deleteAllNotifications', () => {
    it('should delete all for user', async () => {
      await deleteAllNotifications('u1');
      expect(prismaMock.notification.deleteMany).toHaveBeenCalledWith({ where: { userId: 'u1' } });
    });
  });
});
