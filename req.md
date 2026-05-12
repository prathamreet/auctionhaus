The problem here is that there are timers built into the client, but there are also sockets.
Client polling:
- There is a `setInterval` in `front/src/app/auctions/page.tsx` and `front/src/app/auctions/[id]/page.tsx` that causes `Date.now()` to update every second for the countdown.
- `useQuery` in `front/src/app/dashboard/page.tsx`, `front/src/app/admin/page.tsx`, etc., uses `refetchInterval` which could be resource-intensive if lots of users are connected. However, 60s/120s is fine.

Redis/BullMQ backend calls:
The user states: "the whole app is too much resrouce intensive specially on redis bullmq call and api calls eveyrhtime. is there any potential optimization u can do as websockt is already implmente but idk how well please work on the /back or backend and if done then start with fronted api/socket call."

What is actually wrong with BullMQ?
In `back/src/lib/redis.ts`, we see `bullMQConnection` config, but no problem there.
In `back/src/workers/index.ts`, we see `auctionWorker` and `dutchWorker`.
`stalledInterval: 300000` is already quite large.

Is there any other place doing too many API calls?
`useQuery` in `front/src/app/dashboard/page.tsx`:
```
    const handleSync = () => {
      qc.refetchQueries({ queryKey: ["my-bids"] });
      qc.refetchQueries({ queryKey: ["my-auctions"] });
    };
    sock.on("auction:state-sync", handleSync);
```
Wait, `auction:state-sync` is NOT emitted by the backend! I checked `grep -rn "auction:state-sync" back/` and it returns nothing.
Wait, let me double check.
