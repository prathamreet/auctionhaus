/* eslint-disable @typescript-eslint/no-explicit-any */
import { register, login, getMe } from './auth.service';
import { prismaMock } from '../../__mocks__/prisma';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

jest.mock('bcryptjs');
jest.mock('jsonwebtoken');

describe('Auth Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('register', () => {
    it('should successfully register a new user', async () => {
      prismaMock.user.findUnique.mockResolvedValue(null);
      (bcrypt.hash as jest.Mock).mockResolvedValue('hashed_password');
      
      const mockUser = {
        id: '1',
        email: 'test@test.com',
        name: 'Test User',
        role: 'USER',
        createdAt: new Date(),
      };
      
      prismaMock.user.create.mockResolvedValue(mockUser as any);
      (jwt.sign as jest.Mock).mockReturnValue('mock_token');

      const result = await register({
        name: 'Test User',
        email: 'test@test.com',
        password: 'password123',
      });

      expect(prismaMock.user.findUnique).toHaveBeenCalledWith({ where: { email: 'test@test.com' } });
      expect(prismaMock.user.create).toHaveBeenCalled();
      expect(result).toEqual({ user: mockUser, token: 'mock_token' });
    });

    it('should throw error if email already exists', async () => {
      prismaMock.user.findUnique.mockResolvedValue({ id: '1' } as any);

      await expect(register({
        name: 'Test User',
        email: 'test@test.com',
        password: 'password123',
      })).rejects.toThrow('Email already registered');
    });
  });

  describe('login', () => {
    it('should successfully login a user', async () => {
      const mockUser = {
        id: '1',
        email: 'test@test.com',
        password: 'hashed_password',
        role: 'USER',
        isSuspended: false,
      };
      
      prismaMock.user.findUnique.mockResolvedValue(mockUser as any);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      (jwt.sign as jest.Mock).mockReturnValue('mock_token');

      const result = await login({ email: 'test@test.com', password: 'password123' });

      expect(result.token).toBe('mock_token');
      expect(result.user).not.toHaveProperty('password');
      expect(result.user.id).toBe('1');
    });

    it('should throw error for invalid credentials', async () => {
      prismaMock.user.findUnique.mockResolvedValue(null);

      await expect(login({ email: 'test@test.com', password: 'password123' }))
        .rejects.toThrow('Invalid credentials');
    });

    it('should throw error if user is suspended', async () => {
      const mockUser = {
        id: '1',
        email: 'test@test.com',
        password: 'hashed_password',
        role: 'USER',
        isSuspended: true,
      };
      
      prismaMock.user.findUnique.mockResolvedValue(mockUser as any);

      await expect(login({ email: 'test@test.com', password: 'password123' }))
        .rejects.toThrow('Account suspended');
    });
  });

  describe('getMe', () => {
    it('should return user details if user exists', async () => {
      const mockUser = {
        id: '1',
        email: 'test@test.com',
        name: 'Test User',
        role: 'USER',
        wallet: { balance: 100, heldAmount: 0 }
      };

      prismaMock.user.findUnique.mockResolvedValue(mockUser as any);

      const result = await getMe('1');
      expect(result).toEqual(mockUser);
    });

    it('should throw error if user not found', async () => {
      prismaMock.user.findUnique.mockResolvedValue(null);

      await expect(getMe('1')).rejects.toThrow('User not found');
    });
  });
});
