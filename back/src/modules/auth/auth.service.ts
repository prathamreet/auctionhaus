import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../../lib/prisma';
import { createError } from '../../middleware/error.middleware';

const generateToken = (user: { id: string; email: string; role: string }) => {
  const secret = process.env.JWT_SECRET as string;
  const expiresIn = (process.env.JWT_EXPIRES_IN || '7d') as jwt.SignOptions['expiresIn'];
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    secret,
    { expiresIn }
  );
};

export const register = async (data: {
  name: string;
  email: string;
  password: string;
}) => {
  const existing = await prisma.user.findUnique({ where: { email: data.email } });
  if (existing) throw createError('Email already registered', 409);

  const hashedPassword = await bcrypt.hash(data.password, 12);

  const user = await prisma.user.create({
    data: {
      name: data.name,
      email: data.email,
      password: hashedPassword,
      wallet: { create: { balance: 0 } }, // auto-create wallet
    },
    select: { id: true, email: true, name: true, role: true, createdAt: true },
  });

  const token = generateToken({ id: user.id, email: user.email, role: user.role });
  return { user, token };
};

export const login = async (data: { email: string; password: string }) => {
  const user = await prisma.user.findUnique({ where: { email: data.email } });
  if (!user || !user.password) throw createError('Invalid credentials', 401);

  if (user.isSuspended) throw createError('Account suspended', 403);

  const valid = await bcrypt.compare(data.password, user.password);
  if (!valid) throw createError('Invalid credentials', 401);

  const token = generateToken({ id: user.id, email: user.email, role: user.role });

  const { password: _pw, ...safeUser } = user;
  return { user: safeUser, token };
};

export const getMe = async (userId: string) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      name: true,
      avatar: true,
      role: true,
      rating: true,
      ratingCount: true,
      createdAt: true,
      wallet: {
        select: { balance: true, heldAmount: true },
      },
    },
  });

  if (!user) throw createError('User not found', 404);
  return user;
};
