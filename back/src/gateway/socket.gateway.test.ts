/* eslint-disable @typescript-eslint/no-explicit-any */
import { initSocketGateway } from './socket.gateway';
import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';

jest.mock('jsonwebtoken');

describe('Socket Gateway', () => {
  let mockIo: Partial<Server>;
  let mockSocket: Partial<Socket>;

  beforeEach(() => {
    mockSocket = {
      handshake: { auth: {}, headers: {} } as any,
      data: {},
      join: jest.fn(),
      leave: jest.fn(),
      emit: jest.fn(),
      on: jest.fn(),
    };

    mockIo = {
      use: jest.fn(),
      on: jest.fn(),
    };
    jest.clearAllMocks();
  });

  it('should register connection middleware and handlers', () => {
    initSocketGateway(mockIo as Server);

    expect(mockIo.use).toHaveBeenCalled();
    expect(mockIo.on).toHaveBeenCalledWith('connection', expect.any(Function));
  });

  it('should authenticate sockets with tokens', () => {
    initSocketGateway(mockIo as Server);
    const middleware = (mockIo.use as jest.Mock).mock.calls[0][0];

    mockSocket.handshake!.auth = { token: 'valid_token' };
    (jwt.verify as jest.Mock).mockReturnValue({ id: 'u1', role: 'USER' });

    const nextFn = jest.fn();
    middleware(mockSocket, nextFn);

    expect(mockSocket.data!.userId).toBe('u1');
    expect(nextFn).toHaveBeenCalled();
  });

  it('should allow unauthenticated sockets', () => {
    initSocketGateway(mockIo as Server);
    const middleware = (mockIo.use as jest.Mock).mock.calls[0][0];

    const nextFn = jest.fn();
    middleware(mockSocket, nextFn);

    expect(mockSocket.data!.userId).toBeNull();
    expect(nextFn).toHaveBeenCalled();
  });
});
