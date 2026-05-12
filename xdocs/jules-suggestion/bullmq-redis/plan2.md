Okay, `setInterval` is inside `AuctionCard` which is slightly better than being in `AuctionsPage`, but wait! Having a `setInterval` in *every* `AuctionCard` means if there are 12 items on the page, there are 12 separate `setInterval` timers running independently, triggering 12 state updates and 12 re-renders per second! That's bad for performance.
We should refactor `AuctionCard` to just receive `now` as a prop, and have ONE `setInterval` in a top-level component, or we can use a single context/hook for the current time. Actually, if we just move `setInterval` to the parent component (`AuctionsPage`), then there is only 1 timer, but it re-renders the whole list... Wait, a custom hook `useNow()` that registers to a single shared timer, or a tiny `TimerText` component is best.

1. **Optimize Auto-bidding Recursion (Backend)**:
   In `processAutoBids`, avoid `await processAutoBids` recursion.
   Logic:
   Find all active auto-bids for `auctionId`, order by `maxAmount` DESC.
   If none, return.
   If 1, check if they can beat the current price + increment. If so, place one bid and return. Wait, if there is only 1 auto-bidder, they only bid the minimum required to become the highest bidder! Wait, if they are already the highest bidder, we don't bid.
   Actually, the recursive process simulates the bid war. We can simulate it in code and place ONE final bid.

Let's look at `processAutoBids` again.
If there are 2+ auto-bidders, they bid against each other.
The highest `maxAmount` wins. The final price is `Math.min(secondHighest.maxAmount + increment, highest.maxAmount)`.
Wait, the `auto-bid.service.ts` already does:
```
  if (autoBids.length > 1) {
    const secondBid = autoBids[1];
    const beatingAmount = secondBid.maxAmount + auction.minIncrement;
    bidAmount = Math.min(beatingAmount, topAutoBid.maxAmount);
  }
```
And then places the bid:
`const bid = await placeBid(...)`
And then:
`await processAutoBids(...)`

Wait, if it already jumps to `Math.min(beatingAmount, topAutoBid.maxAmount)`, why is it recursive?
Ah, because the `secondBid` bidder was "outbid", so `placeBid` will process the hold. But wait, `processAutoBids` calls `placeBid`, which then does what?
`placeBid` is called inside `processAutoBids`.
Wait, inside `placeBid`:
```
    setImmediate(() => {
      processAutoBids(auctionId, bidderId, amount, io).catch((e) => {
        console.error('Failed to process auto-bids:', e);
      });
    });
```
So `processAutoBids` is called AGAIN by `placeBid`!
And `processAutoBids` itself also calls `processAutoBids`!
```
    // Recursively process if the previous winner also has an auto-bid
    await processAutoBids(auctionId, topAutoBid.bidderId, bidAmount, io);
```
So it calls it TWICE!
Once via `setImmediate` in `placeBid`, and once via `await` in `processAutoBids`.
That's definitely a bug / infinite loop / doubling of processing!
