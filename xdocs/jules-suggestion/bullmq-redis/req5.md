Backend improvements:
1. `processAutoBids` in `back/src/modules/auto-bid/auto-bid.service.ts`:
If we look closely, `processAutoBids` calls `await processAutoBids(...)`. It's recursive.
If two users set very high auto-bids, `processAutoBids` will execute recursively many times, creating many rows in the database, emitting many events, and using too many resources!
Wait, that is exactly what the user means by "too much resource intensive specially on redis bullmq call and api calls everytime."
If we refactor `processAutoBids` to compute the final winning auto-bid in ONE GO instead of recursing through hundreds of bids by an increment!

Frontend improvements:
In `front/src/app/auctions/page.tsx` and `front/src/app/auctions/[id]/page.tsx`, we have:
`qc.refetchQueries({ queryKey: ["auction-bids", id] });`
`qc.refetchQueries({ queryKey: ["auction", id] });`
This forces API calls. Instead we should use `qc.setQueryData`.
Wait, the backend `socket.emit` doesn't send the full bid list or full auction data, but it sends:
`socket.emit('bid:new', { bid: { ... } })`
`socket.emit('auction:price-drop', { auctionId, newPrice })`
`socket.emit('auction:extended', { auctionId, newEndTime, reason })`
If we update the cache manually via `setQueryData`, we can eliminate all these polling API calls!

Wait, also `socket.emit('auction:state', auction)` is sent by backend on reconnect, but not on every state change. On every state change backend could send `socket.emit('auction:state-sync')`.
Wait, earlier I checked `auction:state-sync` and found it's not emitted by the backend! The frontend listens to `auction:state-sync` but the backend never emits it. The frontend `useEffect` does `sock.on("auction:state-sync", handleSync)` but backend only has `auction:sync` which the frontend emits to backend, and backend replies with `auction:state`! This means `auction:state-sync` is a bug or incomplete feature.
 EOF
cat req5.md
