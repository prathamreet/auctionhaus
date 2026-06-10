# Chapter 8 — The Real-Time Layer

## The Problem Socket.io Solves

When you open an auction page on AuctionHaus, you see the current price. If someone else places a bid while you are watching, your screen should update — immediately, without you clicking refresh. This is not possible with plain HTTP, where the browser always initiates the request. The server cannot push data to the browser unless the browser asks.

Socket.io solves this with a persistent bidirectional connection. Once established, either side can send messages at any time. The browser sees `bid:new` and updates its display. The server emits to everyone in the room.

---

## How Socket.io Is Wired Into Express

AuctionHaus shares one HTTP server between Express and Socket.io:

```typescript
// back/src/index.ts
const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: FRONTEND_URL, credentials: true }
});

// Redis adapter (if Redis is available)
io.adapter(createAdapter(redisPub, redisSub));

// Start the gateway
initSocketGateway(io);

// Start both on the same port
httpServer.listen(PORT);
```

The `httpServer` handles both HTTP (for REST API calls) and the WebSocket upgrade request (for Socket.io). When a browser connects to `ws://backend:3001`, the upgrade request goes through the same port as the REST API calls. No separate port needed.

The `io` object is exported from `index.ts` and imported by controllers and workers that need to emit events.

---

## Socket Authentication

When the frontend connects to Socket.io, it sends its JWT in the handshake:

```typescript
// front/src/lib/socket.ts
const socket = io(BACKEND_URL, {
  auth: { token: localStorage.getItem('token') }
});
```

The backend validates this in a middleware:

```typescript
// back/src/gateway/socket.gateway.ts
io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) return next(new Error('Authentication required'));
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    socket.data.userId = decoded.id;
    socket.data.role   = decoded.role;
    next();
  } catch {
    next(new Error('Invalid token'));
  }
});
```

If the token is invalid, the connection is rejected before the socket is established. This prevents unauthenticated users from subscribing to user-specific notification rooms.

---

## Rooms and Events

Socket.io rooms are like chat rooms: you join a room and receive all messages sent to it. You leave when you disconnect or explicitly leave.

### Room Structure

```
auction:{auctionId}  — everyone watching a specific auction
                        anyone can join (even without an account)
                        receives: bid:new, bid:ladder, auction:extended,
                                  auction:price-drop, auction:ended,
                                  auction:presence

user:{userId}        — private room for one user's notifications
                        joined automatically on connect (if authenticated)
                        receives: notification:new

admin:fraud          — the admin fraud dashboard feed
                        joined only if socket.data.role === 'ADMIN'
                        receives: fraud:flag, bid:backpressure
```

### Joining a Room

```typescript
// Client emits
socket.emit('auction:join', { auctionId });

// Server handler
socket.on('auction:join', ({ auctionId }) => {
  socket.join(`auction:${auctionId}`);
  updatePresence(auctionId);  // debounced emit of viewer count
});
```

### The Presence Counter

When users join and leave auction rooms, the system tracks viewer count. This is shown as "N watching" next to the LIVE indicator on the auction page.

Naive implementation: emit `auction:presence` on every join and leave. Problem: if 10 users join in rapid succession (e.g., a popular auction goes live), you emit 10 presence updates in quick succession. Most clients receive an intermediate count they immediately discard.

**Trailing-edge debounce:** instead of emitting immediately, we set a 250ms timer. If another join/leave event arrives within those 250ms, we reset the timer. Only the final stable state triggers the emit.

```typescript
const presenceTimers = new Map<string, NodeJS.Timeout>();

function updatePresence(auctionId: string) {
  const key = `auction:${auctionId}`;
  if (presenceTimers.has(key)) clearTimeout(presenceTimers.get(key)!);
  presenceTimers.set(key, setTimeout(async () => {
    const sockets = await io.in(key).fetchSockets();
    io.to(key).emit('auction:presence', { auctionId, viewers: sockets.length });
    presenceTimers.delete(key);
  }, 250));
}
```

The `fetchSockets()` call is cluster-aware when the Redis adapter is active — it counts sockets across all server instances.

### Disconnection Handling

Socket.io fires `disconnecting` (before leaving rooms) and `disconnect` (after). We listen to `disconnecting` specifically because `socket.rooms` is still populated at that moment:

```typescript
socket.on('disconnecting', () => {
  for (const room of socket.rooms) {
    if (room.startsWith('auction:')) {
      const auctionId = room.replace('auction:', '');
      updatePresence(auctionId);  // viewer count goes down
    }
  }
});
```

At `disconnect`, `socket.rooms` is already empty — we cannot update presence anymore.

---

## The Events Reference

### `bid:new`

```typescript
{
  bid: {
    id: string,
    amount: number | null,      // null for sealed auctions
    bidderId: string | null,    // null for sealed auctions
    bidder: { name: string } | null,
    isAutoBid: boolean,
    createdAt: string
  },
  auctionId: string,
  currentPrice: number,
  sealed: boolean,
  serverTs: number              // server Unix timestamp (ms)
}
```

The `serverTs` field was added in Phase E10. Clients can compute "X seconds ago" against the server clock instead of their own local clock. Since all bids come from the server, using a server timestamp makes the relative timing consistent.

### `bid:ladder`

```typescript
{
  auctionId: string,
  steps: BidStep[],        // every increment step
  finalPrice: number,
  lastBidId: string,
  serverTs: number
}
```

One event carries the entire ladder instead of N individual `bid:new` events. The frontend listens for `bid:ladder` separately and handles it by showing the LadderBanner component and then refetching the bid history once.

### `auction:extended`

```typescript
{ auctionId: string, newEndTime: string }
```

Sent when anti-sniping adds time. The frontend Countdown component reads `newEndTime` and resets its timer.

### `auction:ended`

```typescript
{ auctionId: string, winnerId: string | null, finalPrice: number }
```

Sent when the auction ends. The frontend redirects to a "winner/loser" UI state.

### `fraud:flag`

```typescript
{
  id: string,
  bidderId: string,
  auctionId: string,
  bidId: string,
  score: number,
  features: FeatureVector,
  reason: string,
  createdAt: string
}
```

Sent only to the `admin:fraud` room. Powers the live fraud feed in the admin dashboard.

### `bid:backpressure`

```typescript
{ auctionId: string, streamLength: number, threshold: number, ts: number }
```

Sent to `admin:fraud` when the Redis Stream for a sequenced auction exceeds the backpressure threshold. Tells admins that the sequencer is saturated.

---

## Horizontal Scaling with the Redis Adapter

In a single-process setup, when a bid is placed:

```
bid.controller emits bid:new to room auction:{auctionId}
Socket.io delivers to all sockets in that room (same process)
```

With two server instances:

```
Instance 1 receives the bid, places it
bid.controller emits bid:new to room auction:{auctionId}
Socket.io Redis adapter: PUBLISH to Redis channel
Instance 2 receives the Redis message
Socket.io on Instance 2 delivers to its local sockets in that room
```

The `@socket.io/redis-adapter` handles all of this. The pub/sub connections `redisPub` and `redisSub` are dedicated to the adapter (not shared with the application's own pub/sub).

---

## Reconnect-Aware Hooks

When a socket drops (network hiccup, mobile radio cycle) and reconnects, the server-side room membership is lost. The socket reconnects but is not in any rooms yet. The `useAuctionRoom` hook handles this:

```typescript
// front/src/lib/useSocketListener.ts
export function useAuctionRoom(auctionId: string, onReconnect?: () => void) {
  useEffect(() => {
    const sock = getSocket();
    
    // Join on mount
    sock.emit('auction:join', { auctionId });
    
    // Re-join on reconnect (room membership lost on disconnect)
    const handleReconnect = () => {
      sock.emit('auction:join', { auctionId });
      onReconnect?.();
    };
    sock.io.on('reconnect', handleReconnect);
    
    return () => {
      sock.emit('auction:leave', { auctionId });
      sock.io.off('reconnect', handleReconnect);
    };
  }, [auctionId]);
}
```

The auction page passes a refetch closure as `onReconnect`:

```typescript
useAuctionRoom(auctionId, () => {
  refetchAuction();
  refetchBids();
  refetchAutoBid();
});
```

After reconnection, the app re-fetches the latest state to catch up on anything that happened during the drop.

---

## The ConnectionStatus Component

A visible indicator in the navbar shows the socket connection state:

- **No indicator** when `connected` (assume live)
- **Amber pulsing dot + "Reconnecting..."** when the socket is trying to reconnect
- **Red dot + "Offline"** when the socket has given up

Without this, users watching an auction during a network blip see stale prices with no indication that they are not seeing live data. The component reads `sock.connected` on mount to avoid the initial false "offline" flash.

---

## The `useSocketListener` Hook — Why It Matters

The original code had this pattern repeated in every page:

```typescript
useEffect(() => {
  const socket = getSocket();
  socket.on('bid:new', handleBidNew);
  return () => socket.off('bid:new', handleBidNew);
}, [handleBidNew]);
```

This is subtly broken. If `handleBidNew` is defined inline (not memoized), it is a new function object on every render. The effect re-runs on every render, unsubscribing and re-subscribing constantly.

The `useSocketListener` hook fixes this with a ref:

```typescript
export function useSocketListener(event: string, handler: (data: unknown) => void) {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;  // always up to date, no subscription re-run
  
  useEffect(() => {
    const sock = getSocket();
    const stable = (data: unknown) => handlerRef.current(data);
    sock.on(event, stable);
    return () => sock.off(event, stable);
  }, [event]);  // only re-subscribes if the event NAME changes
}
```

The subscription runs once per event name. The handler can be updated (via `handlerRef.current = handler`) without re-subscribing. This is the ref-stable handler pattern, standard in modern React hooks.

---

## Next Chapter

Chapter 9 is about the auto-bid engine — the most algorithmically interesting part of the backend. The atomic ladder protocol, how it runs in one transaction, and why the per-increment log matters.
