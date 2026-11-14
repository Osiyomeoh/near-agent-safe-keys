# NEAR's agent-safe keys: a thesis you can check yourself

An evidence-first investment thesis for NEAR HACKATHON (track: `thesis`). The claim, the evidence for and against, and what would change our mind are in [THESIS.md](THESIS.md). Our prediction for November was committed before we queried November, and the test passed (4.44% against a bar of 2.0%). See [PREDICTION.md](PREDICTION.md); `git log thesis/PREDICTION.md` shows the order.

## Check it in 60 seconds (no account, no key, no npm install)

1. Run `node thesis/verify.mjs` (Node 18+).
   - **You'll see:** `OK  sha256` for every file listed in `data/SHA256SUMS`, then `120/120 sampled receipts confirmed on chain`.
   - Every count we publish is backed by receipts you can fetch from NEAR's public archival RPC.
2. Run `node thesis/rebuild.mjs`, then open `thesis/dashboard/index.html`.
   - **You'll see:** the function-call share chart (0.01% in March → 2.69% in October), and the top 20 contracts. Each contract has receipt links (r1–r3) that open on nearblocks.io.
3. Run `node thesis/live.mjs`.
   - **You'll see:** for each contract, how many of its 3 sampled keys still exist on mainnet right now. Our run on Nov 11 found 75 live and 45 deleted.
4. Run `node thesis/classify.mjs`.
   - **You'll see:** for each top target, whether it has code and what it is (token, NFT, source repo). Our run found 1,048 keys pointing at accounts with no contract.
5. Optionally, run `node thesis/rebuild.mjs --query` to re-run the BigQuery side yourself.
   - It needs your own Google Cloud project and scans about 1.0 TB, which is about the whole 1 TB monthly free tier (a few cents beyond it).
   - The hard caps are in the script.

## Files

| Path | What |
|---|---|
| `sql/` | Every query, filtered on `block_date` |
| `data/` | The query results, with `SHA256SUMS` |
| `verify.mjs` | The on-chain spot check |
| `rebuild.mjs` | One command that rebuilds everything (`--offline`: dashboard only, no network) |
| `lib.mjs` | The pure functions behind every published number (shares, intervals, verdict) |
| `test/thesis.test.mjs` | Recomputes each headline number from `data/` and checks it against the text |
| `txshare.mjs` | Samples blocks and classifies each transaction's signing key (free public RPC) |
| `protocol_switch.mjs` | Finds the block where protocol 87 ended the 30% contract gas rebate (free public RPC) → `data/protocol_switch.json` |
| `check-anchor.mjs` | Checks the OpenTimestamps proof `PREREG-2.md.ots`: that `PREREG-2.md` is in a Bitcoin block mined at least 2 hours before its window opened |
| `score-prereg2.mjs` | Scores `PREREG-2.md` mechanically: reads the window, seed, bars and frozen code hashes from the stamped file, refuses any other run, prints `HOLDS` or `FAILS` per prediction and the matching row of its result table |
| `live.mjs`, `classify.mjs` | Live key state and target classification (public RPC) |

Data source: `bigquery-public-data.crypto_near_mainnet_us.receipt_actions` (https://docs.near.org/data-infrastructure/big-query).

## Disclosures

- The scripts in this folder (`verify.mjs`, `rebuild.mjs`, `lib.mjs`, `txshare.mjs`, `protocol_switch.mjs`, `check-anchor.mjs`, `score-prereg2.mjs`, `live.mjs`, `classify.mjs`, `test/`, `sql/`) were written with AI help (Claude Code), then reviewed and run by the author.
- Every number comes from a recorded run. Nothing is seeded or illustrative.
- License: MIT (see `LICENSE`).
