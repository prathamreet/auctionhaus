1. **Optimize Auto-bidding Recursion (Backend)**:
   In `back/src/modules/auto-bid/auto-bid.service.ts`, `processAutoBids` relies on recursion that generates a bid per increment until one user hits their max amount. This causes N sequential DB writes and N events emitted (excessive API/socket traffic and Redis load).
   - *Fix*: Refactor `processAutoBids` to compute the final required bid immediately. If there are multiple auto-bidders, determine the highest max bid, find the second highest max bid, and place one counter-bid for the highest bidder at the second highest max amount + increment (or minimum required).

2. **Eliminate API calls on Socket Events (Frontend)**:
   In `front/src/app/auctions/[id]/page.tsx`, when a socket event is received (`bid:new`, `auction:extended`, `auction:price-drop`), the code calls `qc.refetchQueries` which performs unnecessary network requests to re-fetch the entire auction and bid list.
   - *Fix*: Replace `qc.refetchQueries` with `qc.setQueryData` to update the React Query cache optimistically for `auction` and `auction-bids` keys based on the socket payload.

3. **Eliminate Polling for "auction:state-sync" (Frontend & Backend)**:
   The frontend listens to `auction:state-sync` on multiple pages (`/dashboard`, `/auctions`, `/admin`) and triggers a full query refetch when it's supposedly received. The backend never emits it. We should just fix the `refetchInterval` on those pages to rely more on cache, or emit a lightweight ping if necessary. But actually, `refetchInterval: 60000` is fine, we just need to avoid the massive API calls triggered by socket events in the auction room, as those happen on EVERY single bid. Wait, `auction:state-sync` can be left alone since it does nothing, but removing it would be cleaner.

4. **Address SetInterval (Frontend)**:
   In `front/src/app/auctions/[id]/page.tsx` and `front/src/app/auctions/page.tsx`, `setInterval` runs every 1 second to update the UI timers. To optimize React renders, the timer logic could use requestAnimationFrame or just leave `setInterval` since 1s is generally fine unless there are thousands of cards. `setInterval` re-rendering every 1s on a page with 12 items might be okay, but in `AuctionsPage` it triggers a re-render of the *entire* page instead of just the countdown component!
   - *Fix*: Move the countdown logic in `/auctions/page.tsx` into a separate `Countdown` or `AuctionTimer` component so that only the timer re-renders every second, not the entire list. Wait, in `auctions/page.tsx`, the `now` state is kept in the main `AuctionsPage` component or a card component? Let's check `auctions/page.tsx`.
