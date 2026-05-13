process.env.JWT_SECRET = 'test-secret';
process.env.JWT_EXPIRES_IN = '1h';

// Mock Redis to prevent real connections during tests
jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => {
    return {
      on: jest.fn(),
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
      quit: jest.fn(),
      publish: jest.fn(),
      subscribe: jest.fn(),
    };
  });
});

// Mock BullMQ queues
jest.mock('bullmq', () => {
  return {
    Queue: jest.fn().mockImplementation(() => ({
      add: jest.fn(),
      on: jest.fn(),
      close: jest.fn(),
    })),
    Worker: jest.fn().mockImplementation(() => ({
      on: jest.fn(),
      close: jest.fn(),
    })),
  };
});

// Globally mock Prisma so no test accidentally hits the real DB
// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('../lib/prisma', () => require('../__mocks__/prisma'));
