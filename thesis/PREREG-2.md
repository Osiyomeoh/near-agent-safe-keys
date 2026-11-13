# Pre-registration 2: who signs NEAR's transactions, on blocks that don't exist yet

Written before the window below opened. Unlike [PREDICTION.md](PREDICTION.md), it is about blocks that did not exist when we wrote it. Its sha256 is to be stored on NEAR (SocialDB) before the window opens. `node thesis/check-anchor.mjs` checks whether that happened. It needs no account and doesn't rely on our git history.

**Window opens:** `2026-11-14T06:00:00Z`

**Window closes:** `2026-11-14T18:00:00Z`

**Prediction 1:** in 200 random blocks from the window, function-call keys sign **at least 11%** of transactions. Oct 1 – Nov 12 measured **13.1%** (95% interval 11.2–15.6%).

**Prediction 2:** function-call keys for Intents or Chain Signatures (`intents.near`, `v1.signer`) sign **at least 8%** of transactions. Oct 1 – Nov 12 measured **10.2%** (95% interval 8.6–12.2%).

**Prediction 3:** `intents.near` is the most common function-call key target among the window's sampled transactions, with strictly more transactions than any other target, as it was in Oct 1 – Nov 12 (134 of 200 function-call-key transactions).

## How it will be scored (fixed now)

```
node thesis/txshare.mjs --from 2026-11-14T06:00:00Z --to 2026-11-14T18:00:00Z --blocks 200 --seed 1114 --out data/txshare_prereg2.json
```

- Shares are computed by `summarizeTxShare()` in `lib.mjs`, unchanged from the Oct 1 – Nov 12 run. We score the point estimate.
- The scoring code is frozen by hash: `thesis/txshare.mjs` sha256 `cd07dd8696639129755386195e1637f5a33e6ebdd20cde9548f2b630bb0a95d0`, `thesis/lib.mjs` sha256 `77c6e6ad66ea38fdcb7a4905e132b5663fafd4444f5c7d84285e885fc31c1457`. If either has to change before scoring (for example, to survive an RPC outage), the result will list every change.
- 11% and 8% are the lower ends of the Oct 1 – Nov 12 95% intervals, rounded down. So a prediction fails only if the window comes in clearly below what we measured. This tests whether the finding repeats, not whether it grows.

| Result | What it means for the thesis |
|---|---|
| All three hold | "Rare to add, common to use" repeats on new blocks: function-call keys are load-bearing infrastructure, led by Intents |
| 1 holds, 2 or 3 fails | Function-call keys still carry real traffic, but not mainly for agent infrastructure |
| 1 fails | The Oct 1 – Nov 12 share does not repeat. We drop the claim that function-call keys carry a large share of transactions |

## Stated in advance

- Nov 14, 2026 is a Saturday and the NEAR HACKATHON deadline day. Weekend traffic and last-minute builder testing may both move the numbers.
- 200 blocks is a small sample. The Oct 1 – Nov 12 interval was 11.2–15.6% on 300 blocks; one 12-hour window will be noisier.
- The result is added by a later commit, whatever it shows, with the data file in `SHA256SUMS`.
