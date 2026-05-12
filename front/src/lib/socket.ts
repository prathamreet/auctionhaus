import { io, Socket } from "socket.io-client";

let socket: Socket | null = null;

export const getSocket = (): Socket => {
  if (!socket) {
    const token =
      typeof window !== "undefined" ? localStorage.getItem("token") : null;
    socket = io(process.env.NEXT_PUBLIC_WS_URL || "http://localhost:5000", {
      auth: { token },
      withCredentials: true,
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });
  }
  return socket;
};

/**
 * Disconnect and destroy the socket instance.
 * Call this on logout so the next getSocket() creates a fresh
 * connection with the new (or no) auth token.
 */
export const disconnectSocket = () => {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
};

/**
 * Force-reconnect with fresh token.
 * Call this after login so the socket authenticates with the new JWT.
 */
export const reconnectSocket = () => {
  disconnectSocket();
  return getSocket();
};
