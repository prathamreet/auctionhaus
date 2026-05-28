import { NotificationType, Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { createError } from '../../middleware/error.middleware';
import { notificationQueue } from '../../queues/auction.queue';

/**
 * Phase A7: notifyUser is now a fire-and-forget producer onto the
 * notifications BullMQ queue. Previously it did the Notification row insert
 * + socket emit inline, which meant a bid/payment transaction was paying
 * the cost (and risk) of a DB write + socket fan-out on its critical path.
 *
 * The producer returns void -- callers that were `await notifyUser(...)`
 * still work because awaiting a Promise<void> resolves immediately. Callers
 * that were `notifyUser(...).catch(...)` keep working because we return a
 * Promise.
 *
 * If Redis is down, BullMQ's queue.add() will eventually fail. The catch
 * here logs but never throws -- the calling business logic must not fail
 * because a notification couldn't queue.
 *
 * The consumer (notificationWorker in back/src/workers/index.ts) does the
 * DB write + socket emit.
 */
export const notifyUser = async (
  userId: string,
  data: {
    type: NotificationType;
    title: string;
    message: string;
    data?: Prisma.InputJsonValue;
  }
): Promise<void> => {
  try {
    await notificationQueue.add('deliver', {
      userId,
      type: data.type,
      title: data.title,
      message: data.message,
      data: data.data || {},
    });
  } catch (err) {
    console.error('Failed to enqueue notification:', err);
  }
};

export const getNotifications = async (userId: string, page = 1, limit = 20) => {
  const skip = (page - 1) * limit;
  const [notifications, total, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.notification.count({ where: { userId } }),
    prisma.notification.count({ where: { userId, isRead: false } }),
  ]);

  return { notifications, total, unreadCount, page, limit };
};

export const markRead = async (userId: string, notificationId?: string) => {
  if (notificationId) {
    const notification = await prisma.notification.findUnique({ where: { id: notificationId } });
    if (!notification) throw createError('Notification not found', 404);
    if (notification.userId !== userId) throw createError('Not authorized', 403);

    return prisma.notification.update({
      where: { id: notificationId },
      data: { isRead: true },
    });
  }

  // Mark all as read
  await prisma.notification.updateMany({
    where: { userId, isRead: false },
    data: { isRead: true },
  });

  return { message: 'All notifications marked as read' };
};

export const deleteNotification = async (userId: string, notificationId: string) => {
  const notification = await prisma.notification.findUnique({ where: { id: notificationId } });
  if (!notification) throw createError('Notification not found', 404);
  if (notification.userId !== userId) throw createError('Not authorized', 403);

  await prisma.notification.delete({ where: { id: notificationId } });
  return { message: 'Deleted' };
};

export const deleteAllNotifications = async (userId: string) => {
  await prisma.notification.deleteMany({ where: { userId } });
  return { message: 'All notifications deleted' };
};
