So looking at the codebase:
We can make the frontend timers less intensive, and we can refactor `processAutoBids` to avoid recursiveness and make it more iterative? Or wait, `processAutoBids` is not doing too much work if auto-bidders are not active.
The user says:
"the whole app is too much resrouce intensive specially on redis bullmq call and api calls eveyrhtime. is there any potential optimization u can do as websockt is already implmente but idk how well please work on the /back or backend and if done then start with fronted api/socket call."

What are the redis bullmq calls?
In `back/src/modules/auctions/auction.service.ts`:
```
await auctionQueue.add('start-auction', { auctionId: auction.id }, { delay: startDelay });
await auctionQueue.add('end-auction', { auctionId: auction.id }, { delay: endDelay });
```
This is fine.

What about `notifyUser`?
`notifyUser` is called directly, not queued via BullMQ. In `back/src/queues/auction.queue.ts` there is a `notificationQueue`:
```
export const notificationQueue = new Queue('notifications', ...);
```
But `notificationQueue` is never used to `add()` jobs in the backend! Wait!
Let's check `grep -rn "notificationQueue" back/`.
