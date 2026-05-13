import { initWorkers } from './index';

jest.mock('bullmq', () => ({
  Worker: jest.fn().mockImplementation((name) => ({
    name,
    on: jest.fn(),
  })),
  Queue: jest.fn().mockImplementation((name) => ({
    name,
    on: jest.fn(),
  })),
}));

describe('Workers', () => {
  it('should initialize without errors', () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    initWorkers();
    expect(consoleSpy).toHaveBeenCalledWith('BullMQ workers initialized');
    consoleSpy.mockRestore();
  });
});
