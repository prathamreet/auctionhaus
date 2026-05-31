 npm run sim:run

> back@1.0.0 sim:run
> ts-node ../packages/simulator/src/run.ts

[Sim] Run 97f1eda6-0451-435f-8063-0b10ffd60ad3 started — duration 60s
[Sim] Auction 55a4f44b-3de2-460d-9566-4be98356799b created
[Sim] truthful     bid ₹1,300 | price=₹1,000
[Sim] shill        bid ₹1,400 | price=₹1,300
[Sim] collusion    bid ₹1,500 | price=₹1,300
[Sim] shill        bid ₹1,600 | price=₹1,500
[Sim] collusion    bid ₹1,700 | price=₹1,500
[Sim] truthful     bid ₹2,000 | price=₹1,700
[Sim] shill        bid ₹2,100 | price=₹2,000
[Sim] collusion    bid ₹2,200 | price=₹2,000
[Sim] shill        bid ₹2,300 | price=₹2,200
[Sim] collusion    bid ₹2,400 | price=₹2,200
[Sim] shill        bid ₹2,500 | price=₹2,400
[Sim] collusion    bid ₹2,600 | price=₹2,500
[Sim] collusion    bid ₹2,700 | price=₹2,500
[Sim] shill        bid ₹2,800 | price=₹2,700
[Sim] truthful     bid ₹2,900 | price=₹2,800
[Sim] collusion    bid ₹3,000 | price=₹2,800
[Sim] collusion    bid ₹3,100 | price=₹3,000
[Sim] collusion    bid ₹3,300 | price=₹3,100
[Sim] collusion    bid ₹3,400 | price=₹3,300
[Sim] collusion    bid ₹3,600 | price=₹3,400
[Sim] collusion    bid ₹3,700 | price=₹3,600
[Sim] collusion    bid ₹3,800 | price=₹3,700
[Sim] sniper       bid ₹4,300 | price=₹3,800

[Sim] Done. 23 bids (19 shill).
[Sim] Output: E:\projects\auctionhaus\back\packages\simulator\runs\97f1eda6-0451-435f-8063-0b10ffd60ad3
PS E:\projects\auctionhaus\back>


---
---





PS E:\projects\auctionhaus\back> $env:NODE_PATH="E:\projects\auctionhaus\back\node_modules"
PS E:\projects\auctionhaus\back> $env:SIM_RUN_DIR="E:\projects\auctionhaus\back\packages\simulator\runs\97f1eda6-0451-435f-8063-0b10ffd60ad3"
PS E:\projects\auctionhaus\back> npm run eval:fraud

> back@1.0.0 eval:fraud
> ts-node ../packages/simulator/src/eval.ts

[Eval] 23 bid events, 19 shill
[Eval] Best threshold: 0.05 | P=0.864 R=1.000 F1=0.927
[Eval] Ablation:
  responseTimeMs           F1=0.872 P=0.850 R=0.895
  bidFrequencyPerMin       F1=0.872 P=0.850 R=0.895
  incrementRatio           F1=0.872 P=0.850 R=0.895
  sellerCoOccurrence       F1=0.788 P=0.929 R=0.684
  reciprocityScore         F1=0.000 P=0.000 R=0.000
[Eval] Wrote paper/tables/metrics.tex and paper/figures/roc_data.json
[Eval] Baseline F1=0.000 → LR F1=0.927 (+92.7%)
PS E:\projects\auctionhaus\back>
























