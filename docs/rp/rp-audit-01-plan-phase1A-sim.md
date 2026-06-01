S E:\projects\auctionhaus> npm run sim:run

> auctionhaus-monorepo@1.0.0 sim:run
> npm run sim:run --workspace=back


> back@1.0.0 sim:run
> ts-node ../packages/simulator/src/run.ts

[Sim] Run 353c37c5-7bad-4a04-aa78-e846385249a0 started — duration 60s
[Sim] Auction 7ae6797f-b32e-4571-924a-85f50946854b created
[Sim] truthful     bid ₹1,200 | price=₹1,000
[Sim] shill        bid ₹1,300 | price=₹1,200
[Sim] collusion    bid ₹1,400 | price=₹1,200
[Sim] shill        bid ₹1,500 | price=₹1,400
[Sim] collusion    bid ₹1,600 | price=₹1,400
[Sim] shill        bid ₹1,700 | price=₹1,600
[Sim] collusion    bid ₹1,800 | price=₹1,600
[Sim] truthful     bid ₹2,100 | price=₹1,800
[Sim] shill        bid ₹2,200 | price=₹2,100
[Sim] collusion    bid ₹2,300 | price=₹2,100
[Sim] truthful     bid ₹2,600 | price=₹2,300
[Sim] shill        bid ₹2,700 | price=₹2,600
[Sim] collusion    bid ₹2,800 | price=₹2,600
[Sim] shill        bid ₹2,900 | price=₹2,800
[Sim] truthful     bid ₹3,000 | price=₹2,900
[Sim] collusion    bid ₹3,100 | price=₹2,900
[Sim] collusion    bid ₹3,300 | price=₹3,100
[Sim] collusion    bid ₹3,400 | price=₹3,300
[Sim] collusion    bid ₹3,500 | price=₹3,400
[Sim] collusion    bid ₹3,600 | price=₹3,500
[Sim] collusion    bid ₹3,700 | price=₹3,600
[Sim] collusion    bid ₹3,800 | price=₹3,700

[Sim] Done. 22 bids (18 shill).
[Sim] Output: E:\projects\auctionhaus\back\packages\simulator\runs\353c37c5-7bad-4a04-aa78-e846385249a0
PS E:\projects\auctionhaus> npm run train:fraud

> auctionhaus-monorepo@1.0.0 train:fraud
> npm run train:fraud --workspace=back


> back@1.0.0 train:fraud
> ts-node ../packages/simulator/src/train.ts

[Trainer] Starting genuine logistic regression training pipeline...
[Trainer] Found 3 simulation run directories. Extracting features...
[Trainer] Extracted 70 training examples (59 shill / 11 truthful).

[Trainer] Derived Z-Score Parameters (Empirical NORM_PARAMS):
Mean: {
  responseTimeMs: 2399.842857142857,
  bidFrequencyPerMin: 0.1185714285714286,
  incrementRatio: 1.3857142857142857,
  sellerCoOccurrence: 0.8714285714285714,
  reciprocityScore: 0.2923809523809523
}
Std:  {
  responseTimeMs: 1389.498878174783,
  bidFrequencyPerMin: 0.06776141953445385,
  incrementRatio: 0.8990925130034039,
  sellerCoOccurrence: 0.33472498611028506,
  reciprocityScore: 0.17854539492769508
}

[Trainer] Training model via Gradient Descent (epochs=10000, alpha=0.2, lambda=0.01)...
  Epoch 1/10000 | Loss: 0.693187
  Epoch 2000/10000 | Loss: 0.116521
  Epoch 4000/10000 | Loss: 0.116521
  Epoch 6000/10000 | Loss: 0.116521
  Epoch 8000/10000 | Loss: 0.116521
  Epoch 10000/10000 | Loss: 0.116521

[Trainer] Learned Model Weights (Mathematically Optimized):
{
  intercept: 2.7426,
  responseTimeMs: 0.0095,
  bidFrequencyPerMin: 1.4572,
  incrementRatio: -0.9484,
  sellerCoOccurrence: 1.7342,
  reciprocityScore: -0.4409
}

[Trainer] Training Performance:
  Accuracy:  97.14%
  Precision: 0.9672
  Recall:    1.0000
  F1-Score:  0.9833

[Trainer] Updating E:\projects\auctionhaus\back\src\modules\fraud\fraud.classifier.ts...
[Trainer] Successfully wrote updated weights and normalisation params.
PS E:\projects\auctionhaus> npm run eval:fraud

> auctionhaus-monorepo@1.0.0 eval:fraud
> npm run eval:fraud --workspace=back


> back@1.0.0 eval:fraud
> ts-node ../packages/simulator/src/eval.ts

[Eval] SIM_RUN_DIR not set. Automatically resolved latest simulation run: E:\projects\auctionhaus\back\packages\simulator\runs\353c37c5-7bad-4a04-aa78-e846385249a0
[Eval] 22 bid events, 18 shill
[Eval] Best threshold: 0.20 | P=1.000 R=1.000 F1=1.000
[Eval] Ablation:
  responseTimeMs           F1=1.000 P=1.000 R=1.000
  bidFrequencyPerMin       F1=0.971 P=1.000 R=0.944
  incrementRatio           F1=1.000 P=1.000 R=1.000
  sellerCoOccurrence       F1=0.105 P=1.000 R=0.056
  reciprocityScore         F1=1.000 P=1.000 R=1.000
[Eval] Wrote paper/tables/metrics.tex and paper/figures/roc_data.json
[Eval] Baseline F1=0.000 → LR F1=1.000 (+100.0%)
PS E:\projects\auctionhaus>