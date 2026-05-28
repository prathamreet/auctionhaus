Is there anything doing "too much api calls"?
Look at `front/src/app/auctions/[id]/page.tsx`:
```
    const onStateChange = () => {
      qc.refetchQueries({ queryKey: ["auction", id] });
      qc.refetchQueries({ queryKey: ["auction-bids", id] });
    };
```
And `front/src/app/auctions/page.tsx`:
```
    const handleSync = () => {
      qc.refetchQueries({ queryKey: ["auctions"] });
    };
```
Wait, the `qc.refetchQueries({ queryKey: ["auction", id] })` calls an API! That's it!
If we update state via socket payload instead of re-fetching from API, that will save API calls.
Instead of `qc.refetchQueries`, use `qc.setQueryData`.
In `front/src/app/auctions/[id]/page.tsx`, `socket.on("bid:new", onBidNew)`:
```
    const onBidNew = (data: { bid?: { id: string } }) => {
      if (data?.bid?.id) setRecentBidId(data.bid.id);
      // refetchQueries forces immediate network fetch (not just marking stale)
      qc.refetchQueries({ queryKey: ["auction-bids", id] });
      qc.refetchQueries({ queryKey: ["auction", id] });
    };
```
If we use `qc.setQueryData`, we could avoid this refetch. However, doing so might be slightly complex. Let's see if we can do that!

Wait, another issue is Redis/BullMQ:
In the backend, if `processAutoBids` is called too much.
But what else? What if `tick` sets interval every 1 second but actually we don't need `setInterval` if we use a better approach?
