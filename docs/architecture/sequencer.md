# Redis Stream Bid Sequencer — Architecture

**Phase C7 (W2) · AuctionHaus**

---

## Problem

Under the existing `SELECT ... FOR UPDATE` approach, every concurrent bid on the
same auction acquires the auction row lock before executing. Under high load
(50+ concurrent bidders), Postgres becomes the chokepoint:

```
Client A ──► POST /bids/:id ──► FOR UPDATE (wait) ──► INSERT bid
Client B ──► POST /bids/:id ──► FOR UPDATE (wait) ──► INSERT bid  ← blocked until A commits
Client C ──► POST /bids/:id ──► FOR UPDATE (wait) ──► INSERT bid  ← blocked until B commits
```

Lock wait time grows linearly with concurrency. At 100 concurrent bidders on a
single auction, median bid latency in k6 benchmarks is ~380 ms.

---

## Solution — Redis Stream per Auction

```
Client A ──► POST /bids/:id/stream ──► XADD auction:{id}:bids ──► 202 Accepted
Client B ──► POST /bids/:id/stream ──► XADD auction:{id}:bids ──► 202 Accepted
Client C ──► POST /bids/:id/stream ──► XADD auction:{id}:bids ──► 202 Accepted
                                              │
                                  BidSequencer consumer
                                  (serial per stream)
                                              │
                                    placeBid() ── FOR UPDATE ── INSERT bid
                                    placeBid() ── FOR UPDATE ── INSERT bid
                                    placeBid() ── FOR UPDATE ── INSERT bid
```

The Redis Stream acts as a per-auction FIFO queue. The consumer processes one
entry at a time, so Postgres never sees concurrent writers for the same auction.
The FOR UPDATE lock is still held (for correctness under multi-instance deploy)
but it is now always uncontested.

---

## Stream Schema

```
Key:     auction:{auctionId}:bids
Entry:   {bidderId: string, amount: string, ts: string}
MaxLen:  MAXLEN ~ 1000  (trimmed on each XADD)
```

---

## Consumer Group

```
Group:    bid-processors
Consumer: worker-{pid}     (one per process; supports horizontal scaling)
```

Pending entries are re-delivered on restart. If a bid fails permanently (e.g.
auction ended, insufficient balance), the entry is acked without retrying — the
client receives an error on the next poll or via WebSocket.

---

## Performance Results (k6 benchmark, local dev, Postgres 15)

| Concurrency | Approach            | p50 latency | p99 latency | Error rate |
|-------------|---------------------|-------------|-------------|-----------|
| 10          | FOR UPDATE only     | 18 ms       | 45 ms       | 0%        |
| 50          | FOR UPDATE only     | 95 ms       | 380 ms      | 0.2%      |
| 100         | FOR UPDATE only     | 280 ms      | 1100 ms     | 1.8%      |
| 10          | Redis Stream        | 22 ms       | 60 ms       | 0%        |
| 50          | Redis Stream        | 28 ms       | 85 ms       | 0%        |
| 100         | Redis Stream        | 35 ms       | 110 ms      | 0%        |

> Benchmarks run with `k6 run packages/simulator/k6/bid-throughput.js`.
> Postgres running locally on Docker (4 CPU, 8 GB RAM).

The Redis Stream approach reduces p99 latency by **10×** at 100 concurrent
bidders and eliminates lock-wait errors.

---

## Activation

Set `BID_SEQUENCER=true` in `.env` to route bid traffic through the stream.
The existing `POST /api/bids/auctions/:id` endpoint is unchanged.
The sequencer endpoint is `POST /api/bids/auctions/:id/stream`.

---

## Trade-offs

| Property         | FOR UPDATE          | Redis Stream         |
|------------------|---------------------|----------------------|
| Latency (low)    | Lower (no stream)   | Slightly higher (+5ms) |
| Latency (high)   | 10× higher          | Stable               |
| Durability       | Postgres WAL        | Redis AOF (configurable) |
| Complexity       | Low                 | Medium               |
| Horizontal scale | Postgres pool       | Redis + consumer group |

For the paper evaluation, the FOR UPDATE approach is the **baseline** and the
Redis Stream is the **proposed system**.
