PS E:\projects\auctionhaus> k6 run packages/simulator/k6/bid-throughput.js -e SIM_TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6ImFjYWI0OWI0LTE1OWYtNDkxMi1hMDAzLTcwZDQ1ZWQ2OTdhNyIsImVtYWlsIjoiYmVuY2hAYXVjdGlvbmhhdXMuY29tIiwicm9sZSI6IlVTRVIiLCJpYXQiOjE3ODAyMjY1ODQsImV4cCI6MTc4MDgzMTM4NH0.4IJmj8t05ludRuG5ejrgRX49WNvJ6B6vYSWFixqbXEI" -e AUCTION_ID="f1fef494-9794-4b81-a74f-cf06e83ca98c" -e VUS=1 -e DURATION="15s" -e MODE="direct"

         /\      Grafana   /‾‾/
    /\  /  \     |\  __   /  /
   /  \/    \    | |/ /  /   ‾‾\
  /          \   |   (  |  (‾)  |
 / __________ \  |_|\_\  \_____/


     execution: local
        script: packages/simulator/k6/bid-throughput.js
        output: -

     scenarios: (100.00%) 1 scenario, 1 max VUs, 45s max duration (incl. graceful stop):
              * constant_load: 1 looping VUs for 15s (gracefulStop: 30s)

┌─────────────────────────────────────────────────────────────────┐
│              AuctionHaus Bid Throughput Benchmark               │
├──────────────────────┬──────────────┬──────────────┬────────────┤
│ Mode                 │ p50          │ p95          │ p99        │
├──────────────────────┼──────────────┼──────────────┼────────────┤
│ Direct (FOR UPDATE)  │ —       │ 236.0ms       │ —    │
│ Redis Stream         │ —       │ 0.0ms       │ —    │
└──────────────────────┴──────────────┴──────────────┴────────────┘

VUs: 1   Duration: 15s


running (15.1s), 0/1 VUs, 53 complete and 0 interrupted iterations
constant_load ✓ [======================================] 1 VUs  15s
PS E:\projects\auctionhaus>

---
---
PS E:\projects\auctionhaus> k6 run packages/simulator/k6/bid-throughput.js -e SIM_TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6ImFjYWI0OWI0LTE1OWYtNDkxMi1hMDAzLTcwZDQ1ZWQ2OTdhNyIsImVtYWlsIjoiYmVuY2hAYXVjdGlvbmhhdXMuY29tIiwicm9sZSI6IlVTRVIiLCJpYXQiOjE3ODAyMjY1ODQsImV4cCI6MTc4MDgzMTM4NH0.4IJmj8t05ludRuG5ejrgRX49WNvJ6B6vYSWFixqbXEI" -e AUCTION_ID="f1fef494-9794-4b81-a74f-cf06e83ca98c" -e VUS=10 -e DURATION="15s" -e MODE="direct"

         /\      Grafana   /‾‾/
    /\  /  \     |\  __   /  /
   /  \/    \    | |/ /  /   ‾‾\
  /          \   |   (  |  (‾)  |
 / __________ \  |_|\_\  \_____/


     execution: local
        script: packages/simulator/k6/bid-throughput.js
        output: -

     scenarios: (100.00%) 1 scenario, 10 max VUs, 45s max duration (incl. graceful stop):
              * constant_load: 10 looping VUs for 15s (gracefulStop: 30s)

┌─────────────────────────────────────────────────────────────────┐
│              AuctionHaus Bid Throughput Benchmark               │
├──────────────────────┬──────────────┬──────────────┬────────────┤
│ Mode                 │ p50          │ p95          │ p99        │
├──────────────────────┼──────────────┼──────────────┼────────────┤
│ Direct (FOR UPDATE)  │ —       │ 1284.4ms       │ —    │
│ Redis Stream         │ —       │ 0.0ms       │ —    │
└──────────────────────┴──────────────┴──────────────┴────────────┘

VUs: 10   Duration: 15s


running (15.9s), 00/10 VUs, 143 complete and 0 interrupted iterations
constant_load ✓ [======================================] 10 VUs  15s
PS E:\projects\auctionhaus>


---
---
PS E:\projects\auctionhaus> k6 run packages/simulator/k6/bid-throughput.js -e SIM_TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6ImFjYWI0OWI0LTE1OWYtNDkxMi1hMDAzLTcwZDQ1ZWQ2OTdhNyIsImVtYWlsIjoiYmVuY2hAYXVjdGlvbmhhdXMuY29tIiwicm9sZSI6IlVTRVIiLCJpYXQiOjE3ODAyMjY1ODQsImV4cCI6MTc4MDgzMTM4NH0.4IJmj8t05ludRuG5ejrgRX49WNvJ6B6vYSWFixqbXEI" -e AUCTION_ID="f1fef494-9794-4b81-a74f-cf06e83ca98c" -e VUS=100 -e DURATION="15s" -e MODE="direct"

         /\      Grafana   /‾‾/
    /\  /  \     |\  __   /  /
   /  \/    \    | |/ /  /   ‾‾\
  /          \   |   (  |  (‾)  |
 / __________ \  |_|\_\  \_____/


     execution: local
        script: packages/simulator/k6/bid-throughput.js
        output: -

     scenarios: (100.00%) 1 scenario, 100 max VUs, 45s max duration (incl. graceful stop):
              * constant_load: 100 looping VUs for 15s (gracefulStop: 30s)

┌─────────────────────────────────────────────────────────────────┐
│              AuctionHaus Bid Throughput Benchmark               │
├──────────────────────┬──────────────┬──────────────┬────────────┤
│ Mode                 │ p50          │ p95          │ p99        │
├──────────────────────┼──────────────┼──────────────┼────────────┤
│ Direct (FOR UPDATE)  │ —       │ 5771.7ms       │ —    │
│ Redis Stream         │ —       │ 0.0ms       │ —    │
└──────────────────────┴──────────────┴──────────────┴────────────┘

VUs: 100   Duration: 15s


running (19.1s), 000/100 VUs, 570 complete and 0 interrupted iterations
constant_load ✓ [======================================] 100 VUs  15s
ERRO[0019] thresholds on metrics 'bid_errors, bid_latency{mode:direct}' have been crossed
PS E:\projects\auctionhaus>

---
---
---

PS E:\projects\auctionhaus> k6 run packages/simulator/k6/bid-throughput.js -e SIM_TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6ImFjYWI0OWI0LTE1OWYtNDkxMi1hMDAzLTcwZDQ1ZWQ2OTdhNyIsImVtYWlsIjoiYmVuY2hAYXVjdGlvbmhhdXMuY29tIiwicm9sZSI6IlVTRVIiLCJpYXQiOjE3ODAyMjY1ODQsImV4cCI6MTc4MDgzMTM4NH0.4IJmj8t05ludRuG5ejrgRX49WNvJ6B6vYSWFixqbXEI" -e AUCTION_ID="f1fef494-9794-4b81-a74f-cf06e83ca98c" -e VUS=1 -e DURATION="15s" -e MODE="stream"

         /\      Grafana   /‾‾/
    /\  /  \     |\  __   /  /
   /  \/    \    | |/ /  /   ‾‾\
  /          \   |   (  |  (‾)  |
 / __________ \  |_|\_\  \_____/


     execution: local
        script: packages/simulator/k6/bid-throughput.js
        output: -

     scenarios: (100.00%) 1 scenario, 1 max VUs, 45s max duration (incl. graceful stop):
              * constant_load: 1 looping VUs for 15s (gracefulStop: 30s)

┌─────────────────────────────────────────────────────────────────┐
│              AuctionHaus Bid Throughput Benchmark               │
├──────────────────────┬──────────────┬──────────────┬────────────┤
│ Mode                 │ p50          │ p95          │ p99        │
├──────────────────────┼──────────────┼──────────────┼────────────┤
│ Direct (FOR UPDATE)  │ —       │ 0.0ms       │ —    │
│ Redis Stream         │ —       │ 133.9ms       │ —    │
└──────────────────────┴──────────────┴──────────────┴────────────┘

VUs: 1   Duration: 15s


running (15.1s), 0/1 VUs, 86 complete and 0 interrupted iterations
constant_load ✓ [======================================] 1 VUs  15s
ERRO[0015] thresholds on metrics 'bid_latency{mode:stream}' have been crossed
PS E:\projects\auctionhaus>

---
---
PS E:\projects\auctionhaus> k6 run packages/simulator/k6/bid-throughput.js -e SIM_TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6ImFjYWI0OWI0LTE1OWYtNDkxMi1hMDAzLTcwZDQ1ZWQ2OTdhNyIsImVtYWlsIjoiYmVuY2hAYXVjdGlvbmhhdXMuY29tIiwicm9sZSI6IlVTRVIiLCJpYXQiOjE3ODAyMjY1ODQsImV4cCI6MTc4MDgzMTM4NH0.4IJmj8t05ludRuG5ejrgRX49WNvJ6B6vYSWFixqbXEI" -e AUCTION_ID="f1fef494-9794-4b81-a74f-cf06e83ca98c" -e VUS=10 -e DURATION="15s" -e MODE="stream"

         /\      Grafana   /‾‾/
    /\  /  \     |\  __   /  /
   /  \/    \    | |/ /  /   ‾‾\
  /          \   |   (  |  (‾)  |
 / __________ \  |_|\_\  \_____/


     execution: local
        script: packages/simulator/k6/bid-throughput.js
        output: -

     scenarios: (100.00%) 1 scenario, 10 max VUs, 45s max duration (incl. graceful stop):
              * constant_load: 10 looping VUs for 15s (gracefulStop: 30s)

┌─────────────────────────────────────────────────────────────────┐
│              AuctionHaus Bid Throughput Benchmark               │
├──────────────────────┬──────────────┬──────────────┬────────────┤
│ Mode                 │ p50          │ p95          │ p99        │
├──────────────────────┼──────────────┼──────────────┼────────────┤
│ Direct (FOR UPDATE)  │ —       │ 0.0ms       │ —    │
│ Redis Stream         │ —       │ 47.9ms       │ —    │
└──────────────────────┴──────────────┴──────────────┴────────────┘

VUs: 10   Duration: 15s


running (15.1s), 00/10 VUs, 1392 complete and 0 interrupted iterations
constant_load ✓ [======================================] 10 VUs  15s
ERRO[0015] thresholds on metrics 'bid_errors' have been crossed
PS E:\projects\auctionhaus>

---
---

PS E:\projects\auctionhaus> k6 run packages/simulator/k6/bid-throughput.js -e SIM_TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6ImFjYWI0OWI0LTE1OWYtNDkxMi1hMDAzLTcwZDQ1ZWQ2OTdhNyIsImVtYWlsIjoiYmVuY2hAYXVjdGlvbmhhdXMuY29tIiwicm9sZSI6IlVTRVIiLCJpYXQiOjE3ODAyMjY1ODQsImV4cCI6MTc4MDgzMTM4NH0.4IJmj8t05ludRuG5ejrgRX49WNvJ6B6vYSWFixqbXEI" -e AUCTION_ID="f1fef494-9794-4b81-a74f-cf06e83ca98c" -e VUS=100 -e DURATION="15s" -e MODE="stream"

         /\      Grafana   /‾‾/
    /\  /  \     |\  __   /  /
   /  \/    \    | |/ /  /   ‾‾\
  /          \   |   (  |  (‾)  |
 / __________ \  |_|\_\  \_____/


     execution: local
        script: packages/simulator/k6/bid-throughput.js
        output: -

     scenarios: (100.00%) 1 scenario, 100 max VUs, 45s max duration (incl. graceful stop):
              * constant_load: 100 looping VUs for 15s (gracefulStop: 30s)

┌─────────────────────────────────────────────────────────────────┐
│              AuctionHaus Bid Throughput Benchmark               │
├──────────────────────┬──────────────┬──────────────┬────────────┤
│ Mode                 │ p50          │ p95          │ p99        │
├──────────────────────┼──────────────┼──────────────┼────────────┤
│ Direct (FOR UPDATE)  │ —       │ 0.0ms       │ —    │
│ Redis Stream         │ —       │ 8.1ms       │ —    │
└──────────────────────┴──────────────┴──────────────┴────────────┘

VUs: 100   Duration: 15s


running (15.0s), 000/100 VUs, 14626 complete and 0 interrupted iterations
constant_load ✓ [======================================] 100 VUs  15s
ERRO[0015] thresholds on metrics 'bid_errors' have been crossed
PS E:\projects\auctionhaus>

---
---
---

PS E:\projects\auctionhaus> k6 run packages/simulator/k6/bid-throughput.js -e SIM_TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6ImFjYWI0OWI0LTE1OWYtNDkxMi1hMDAzLTcwZDQ1ZWQ2OTdhNyIsImVtYWlsIjoiYmVuY2hAYXVjdGlvbmhhdXMuY29tIiwicm9sZSI6IlVTRVIiLCJpYXQiOjE3ODAyMjY1ODQsImV4cCI6MTc4MDgzMTM4NH0.4IJmj8t05ludRuG5ejrgRX49WNvJ6B6vYSWFixqbXEI" -e AUCTION_ID="f1fef494-9794-4b81-a74f-cf06e83ca98c" -e VUS=10 -e DURATION="15s" -e MODE="stream"

         /\      Grafana   /‾‾/
    /\  /  \     |\  __   /  /
   /  \/    \    | |/ /  /   ‾‾\
  /          \   |   (  |  (‾)  |
 / __________ \  |_|\_\  \_____/


     execution: local
        script: packages/simulator/k6/bid-throughput.js
        output: -

     scenarios: (100.00%) 1 scenario, 10 max VUs, 45s max duration (incl. graceful stop):
              * constant_load: 10 looping VUs for 15s (gracefulStop: 30s)

┌─────────────────────────────────────────────────────────────────┐
│              AuctionHaus Bid Throughput Benchmark               │
├──────────────────────┬──────────────┬──────────────┬────────────┤
│ Mode                 │ p50          │ p95          │ p99        │
├──────────────────────┼──────────────┼──────────────┼────────────┤
│ Direct (FOR UPDATE)  │ —       │ 0.0ms       │ —    │
│ Redis Stream         │ —       │ 2.7ms       │ —    │
└──────────────────────┴──────────────┴──────────────┴────────────┘

VUs: 10   Duration: 15s


running (15.1s), 00/10 VUs, 1479 complete and 0 interrupted iterations
constant_load ✓ [======================================] 10 VUs  15s
ERRO[0015] thresholds on metrics 'bid_errors' have been crossed
PS E:\projects\auctionhaus>

---
---
PS E:\projects\auctionhaus> k6 run packages/simulator/k6/bid-throughput.js -e SIM_TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6ImFjYWI0OWI0LTE1OWYtNDkxMi1hMDAzLTcwZDQ1ZWQ2OTdhNyIsImVtYWlsIjoiYmVuY2hAYXVjdGlvbmhhdXMuY29tIiwicm9sZSI6IlVTRVIiLCJpYXQiOjE3ODAyMjY1ODQsImV4cCI6MTc4MDgzMTM4NH0.4IJmj8t05ludRuG5ejrgRX49WNvJ6B6vYSWFixqbXEI" -e AUCTION_ID="f1fef494-9794-4b81-a74f-cf06e83ca98c" -e VUS=10 -e DURATION="15s" -e MODE="direct"

         /\      Grafana   /‾‾/
    /\  /  \     |\  __   /  /
   /  \/    \    | |/ /  /   ‾‾\
  /          \   |   (  |  (‾)  |
 / __________ \  |_|\_\  \_____/


     execution: local
        script: packages/simulator/k6/bid-throughput.js
        output: -

     scenarios: (100.00%) 1 scenario, 10 max VUs, 45s max duration (incl. graceful stop):
              * constant_load: 10 looping VUs for 15s (gracefulStop: 30s)

┌─────────────────────────────────────────────────────────────────┐
│              AuctionHaus Bid Throughput Benchmark               │
├──────────────────────┬──────────────┬──────────────┬────────────┤
│ Mode                 │ p50          │ p95          │ p99        │
├──────────────────────┼──────────────┼──────────────┼────────────┤
│ Direct (FOR UPDATE)  │ —       │ 4.0ms       │ —    │
│ Redis Stream         │ —       │ 0.0ms       │ —    │
└──────────────────────┴──────────────┴──────────────┴────────────┘

VUs: 10   Duration: 15s


running (15.0s), 00/10 VUs, 1470 complete and 0 interrupted iterations
constant_load ✓ [======================================] 10 VUs  15s
ERRO[0015] thresholds on metrics 'bid_errors' have been crossed
PS E:\projects\auctionhaus>

-----
# NEW
-----

PS E:\projects\auctionhaus> k6 run packages/simulator/k6/bid-throughput.js -e SIM_TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjY5ZmFmYjc5LTA1ODMtNGVjZi05Nzk2LTYzMWE0MjkwMzVlMyIsImVtYWlsIjoiYmVuY2hAYXVjdGlvbmhhdXMuY29tIiwicm9sZSI6IlVTRVIiLCJpYXQiOjE3ODAzMDE3MDAsImV4cCI6MTc4MDkwNjUwMH0.jIir4KYRSgGQgNSEpEEfE41s_VVn89HkH9AavB7tbhw" -e AUCTION_ID="8517a966-baf8-4f37-92bb-2e380f0863f3" -e VUS=1 -e DURATION="15s" -e MODE="direct"

         /\      Grafana   /‾‾/
    /\  /  \     |\  __   /  /
   /  \/    \    | |/ /  /   ‾‾\
  /          \   |   (  |  (‾)  |
 / __________ \  |_|\_\  \_____/


     execution: local
        script: packages/simulator/k6/bid-throughput.js
        output: -

     scenarios: (100.00%) 1 scenario, 1 max VUs, 45s max duration (incl. graceful stop):
              * constant_load: 1 looping VUs for 15s (gracefulStop: 30s)

┌─────────────────────────────────────────────────────────────────┐
│              AuctionHaus Bid Throughput Benchmark               │
├──────────────────────┬──────────────┬──────────────┬────────────┤
│ Mode                 │ p50          │ p95          │ p99        │
├──────────────────────┼──────────────┼──────────────┼────────────┤
│ Direct (FOR UPDATE)  │ —       │ 1898.1ms       │ —    │
│ Redis Stream         │ —       │ 0.0ms       │ —    │
└──────────────────────┴──────────────┴──────────────┴────────────┘

VUs: 1   Duration: 15s


running (15.7s), 0/1 VUs, 12 complete and 0 interrupted iterations
constant_load ✓ [======================================] 1 VUs  15s
PS E:\projects\auctionhaus>

----
----

