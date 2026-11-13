# NEAR's agent-safe keys: rare to add, common to use, just starting to spread

> **In 30 seconds**
> - **Claim:** NEAR's function-call keys are the safest way to give an AI agent access to an account, and they are built into NEAR's account model. On Ethereum and similar chains, the same thing usually needs a smart-contract wallet with session keys. Builders have just started to use them.
> - **For:** function-call key additions rose 9× from Aug to Oct 2026 (816 → 7,363), and their share of new keys rose from 0.01% to 2.69%.
> - **Out-of-sample test passed:** we committed a prediction (≥ 2.0% in November) before querying November. The result was **4.44%** for Nov 1–13. See [PREDICTION.md](PREDICTION.md).
> - **Not just growth:** transactions rose 7% over the same months.
> - **Rare to add, common to use:** function-call keys are under 5% of new keys, but they sign **13.1%** (95% interval 11.2–15.6%) of transactions in 300 random blocks from Oct 1 – Nov 12. Only 29 accounts sign that way, and `intents.near` alone signs two-thirds of those transactions, with a key that can only call `execute_intents`.
> - **For a NEAR holder:** supply grows 2.47% a year, set by issuance. Fees burnt offset about 1% of it, so agent usage doesn't move supply yet.
> - **Against:** about 96–97% of new keys are still full-access. Only 1.8% of function-call keys point at agent infrastructure (Intents, Chain Signatures), 11% point at accounts with no contract, and 45 of 120 sampled keys were deleted within weeks.
> - **Verdict (computed by `verdict()` in `lib.mjs` from the rules below):** STRENGTHENING, NOT CONFIRMED. The moat is real and NEAR Intents already runs on it, but few agents hold these keys yet. Watch Nov–Dec: if the new-key share holds above 2% without hackathon traffic, the thesis strengthens.
> - **Next test, fixed before its blocks exist:** [PREREG-2.md](PREREG-2.md) predicts the transaction shares for 2026-11-14, 06:00–18:00 UTC.
> - **Check it:** run `node thesis/verify.mjs`, or open the dashboard and press **Verify**. No account is needed.

**The claim.** On NEAR, any account can natively hand out a key that can call only one contract, with a gas allowance, and can't move funds: a *function-call access key*. That is the safest way to give an AI agent or an app access to an account. If agents are going to hold money, this feature is a long-term edge for NEAR. **The data says the edge is real, rarely handed out, and already doing real work. Function-call keys are under 5% of new keys but sign about 13% of transactions, mostly NEAR Intents' own relay. New keys started to move in Sep–Oct 2026, and most of that move is game and app logins, not agents.**

Check every number yourself, with no account: `node thesis/verify.mjs`.
- It checks each data file against `data/SHA256SUMS`.
- It confirms 120 sampled receipts (3 for each of the top 40 contracts) against NEAR's public archival RPC.
- It re-reads 20 signing keys from the transaction sample (10 function-call, 10 full-access, picked by a fixed seed) at the block before each transaction.
- Last run (Nov 13, 2026, 16:39 UTC): every data hash OK, **120/120 receipts and 20/20 signing keys confirmed on chain**, exit 0.

## Data

All data comes from the NEAR BigQuery public dataset, `bigquery-public-data.crypto_near_mainnet_us.receipt_actions`, filtered on `block_date`. The queries are in `sql/`.

| Month (2026) | Full-access keys added | Function-call keys added | Function-call share | CreateAccount | Distinct function-call targets |
|---|---:|---:|---:|---:|---:|
| Mar | 10,661,054 | 855 | 0.01% | 3,724,246 | 132 |
| Apr | 2,487,775 | 823 | 0.03% | 135,275 | 67 |
| May | 643,668 | 902 | 0.14% | 59,096 | 144 |
| Jun | 517,723 | 597 | 0.12% | 56,923 | 96 |
| Jul | 482,472 | 423 | 0.09% | 37,391 | 74 |
| Aug | 451,570 | 816 | 0.18% | 39,971 | 165 |
| Sep | 330,893 | 5,963 | 1.77% | 76,163 | 1,348 |
| Oct | 266,033 | 7,363 | 2.69% | 119,352 | 833 |

- Source: `data/keys_by_month_mar_oct.csv`, from BigQuery job `h2_keys_1794390369`.
- Share = function-call keys ÷ (function-call + full-access keys).
- The transaction sample and the protocol settings below don't use BigQuery. They come from NEAR's public RPC and from neardata, FastNEAR's public block archive, with no account or key.

## Evidence for

- **Function-call key additions rose about 9× from August to October** (816 → 7,363).
- **Distinct target contracts rose about 8× from August to September** (165 → 1,348). The feature is being used by more builders, not just more often.
- **It isn't just network growth.** Monthly transactions were nearly flat from Aug to Oct (21.1M → 22.6M, +7%), while function-call keys rose 9×. Per million transactions, that's 38.6 → 325.4. Source: `data/activity_by_month.csv`, from `sql/activity_by_month.sql` (7.77 GB scanned).
- **Builder interest is visible in this hackathon:** 56 of the 137 GitHub repos linked from NEAR HACKATHON demo posts mention function-call keys. This is interest, not usage. List and method: `data/hackathon_fc_key_mentions.json` (README text matched against `/function[- ]call (access )?key/i`, Nov 11, 2026).

## Evidence against

- **Full-access keys still dominate:** 97%+ of new keys, even in October.
- **The jump is mostly logins, not agents.** In Sep–Oct, of the top function-call targets (`data/fc_receivers_sep_oct.json`):
  - a game: `aa-harvest-moon.near`, 3,433 keys across 3,392 accounts
  - staking apps: `meta-pool.near` (816) and `linear-protocol.near` (319)
  - meme sites: `meme-cooking.near` (266) and nekotoken (252 + 243)
  - social: `social.near` (198) and `social` (153)
- **Only a few targets look like bots or agents.** For example, `0fb5bdc4d3ee4230.trade.unrlzd.near` has 197 keys on 1 account, and `de8a9ccc3e8cbb1b.trade.unrlzd.near` has 113 keys on 1 account. That's a pattern consistent with a trading program rotating its keys. It is not proof that they're AI agents.
- **March is an outlier:** 10.7 million full-access keys and 3.7 million CreateAccount actions in one month look like a single bulk event. We haven't yet checked who created them.

## What the top 40 targets are (`node thesis/classify.mjs`)

This reads public on-chain facts with no account: whether the target holds code, its token or NFT metadata, and its NEP-330 source link. Saved to `data/targets.json` on 2026-11-11 (live state, so it isn't in SHA256SUMS). The 40 targets hold 9,291 keys.

- **Tokens and staking dominate:** MOON (game), stNEAR, LiNEAR, COOKIE/NEKO, wNEAR, plus meme launchpads.
- **Agent-grade infrastructure is present but small:** `intents.near` (96 keys) and the Chain Signatures signer `v1.signer` (68 keys) make up **164 keys, 1.8%**. That is the strongest evidence for the agent thesis, and it is thin.
- **About 11% of keys can't do anything today:** 1,048 keys (11 targets) point at accounts with **no deployed contract**, including all six `*.trade.unrlzd.near` sub-accounts. A function call to an account with no code fails. Raw adoption counts overstate real use.
- **Single-account targets:** 635 keys sit on 7 targets with just one account each. That looks like one program rotating keys, which matches the deletions below.

## Is it still true today? (`node thesis/live.mjs`)

- `live.mjs` asks NEAR's public RPC (finality `final`, no account) whether each of the 120 sampled keys still exists.
- Run at block 224,118,127 (2026-11-11 21:11 UTC): **75 still live, 45 deleted since, 0 unreadable.**
- About 38% of the sampled keys were deleted within 1–2 months. That fits short-lived session keys (an app or bot rotating keys), not long-held delegation. It is a sample of 120 keys, not a rate for the whole chain.

- **October's signer jump is spread out, not one event.** October had 826,700 distinct signers against 302,272 in September (2.7×), while transactions barely moved. `sql/oct_new_signers.sql` (2.5 GB) lists what signers who were new in October called (`data/oct_new_signers.json`):
  - `wrap.near` (22,030 new signers)
  - the HOT Telegram game `game.hot.tg` (20,600)
  - `bridge-mng.near` (18,961)
  - Ref's `dclv2.ref-labs.near` (14,145)
  - `ai-8.nearlytrade.near` (13,406; "AI" is in its name only, which isn't proof it's an agent)
  - `autonomousinu.near` and one implicit account, with about 1 tx per signer each. That looks like airdrop or farm traffic.

  No single contract explains it, and part of it is likely farmed. This weakens "more users" as a reading of October.

## Who signs NEAR's transactions? (`node thesis/txshare.mjs`)

New keys show who is *setting up* access. Signed transactions show who is *using* it.

- **Method:** `txshare.mjs` draws 300 random block heights from Oct 1 to Nov 13, 2026 (seed 1001; the last sampled block is Nov 12, 20:26 UTC). It reads all 1,521 transactions in them from neardata. For each one it asks NEAR's archival RPC for the signing key's permission as of the block before. Every key was readable.
- **Intervals** resample whole blocks (2,000 draws, fixed seed), because one busy signer can fill a block.
- Raw rows: `data/txshare_oct1_nov13.json`, in `SHA256SUMS`. `verify.mjs` re-reads 20 of the keys on chain.

| Share of sampled transactions | Value |
|---|---|
| Signed with a function-call key | **13.1%** (95% interval 11.2–15.6%) |
| Share of NEAR burnt by those transactions | **11.2%** (95% interval 7.4–16.7%) |
| Signed with a function-call key for Intents or Chain Signatures (`intents.near`, `v1.signer`) | **10.2%** (95% interval 8.6–12.2%) |

Who they are (200 function-call-key transactions):
- **NEAR Intents, 134.** All are signed by `intents.near` itself, with a key on its own account that can only call `execute_intents` ([example](https://nearblocks.io/txns/By93eNuMxUDeofFSbcZvyd4covfcLHkBUs8DUKozyneX)). They're spread out: 99 of the 300 blocks, on 40 different days. Intents settles through exactly the narrow key this thesis is about.
- **Chain Signatures, 21.** These come from 11 MPC node operators, such as `bitwise-mpc01.near`, `everstake-mpc-1.near` and `stakin-mpc.near`, each with a function-call key for `v1.signer`.
- **Trading, 26.** Four accounts sent swaps to `v2.ref-finance.near` with keys limited to `swap`. 13 of the 26 failed, which fits bots racing each other.
- **The rest, 19,** go to 12 other targets.
- **Only 29 accounts** signed with a function-call key, against 384 with full-access keys.

What it means:
- **For:** the agent-safe pattern is already load-bearing. NEAR's main agent-facing product settles through it every day.
- **Against:** it's a handful of operators, not a crowd of agents. Without `intents.near`, function-call keys would sign about 4.3% of transactions (66 of 1,521). One team's design choice carries most of this number.

## What this means for a NEAR holder

This is the status of a thesis, not investment advice. A holder's question is whether this usage changes NEAR's supply.

- **Supply grows 2.47% a year.** Total supply went from 1,307,742,039 NEAR (block 217,998,958, Oct 1) to 1,311,523,824 NEAR (block 224,262,619, Nov 12). That's +3,781,786 NEAR in 42.8 days. Source: the `total_supply` field of the sampled block headers.
- **That growth is issuance, running at the cap.**
  - NEAR mints up to 2.5% of supply a year: `max_inflation_rate` is 1/40 in `data/protocol_config.json`, read from mainnet at block 224,380,400.
  - The [validator docs](https://docs.near.org/protocol/network/validators) describe the same budget, and say that rewards validators don't earn are not minted.
  - Net growth plus the burn below comes to 2.50% a year. So validators earned nearly the whole budget.
- **Fees burnt: about 354,000 NEAR a year** (95% interval 298,000–419,000), or 0.027% of supply.
  - This is the `balance_burnt` of each sampled block's new chunks, scaled to every block in the window.
  - NEAR burns transaction fees ([validator docs](https://docs.near.org/protocol/network/validators), [gas docs](https://docs.near.org/protocol/transactions/gas)). That burn offsets about 1% of new issuance.
  - Function-call-key transactions caused **11.2%** of the NEAR burnt by the sampled transactions.
- **The contract rebate ended on Nov 4.** Up to protocol 86, a contract got back 30% of the gas its calls burned. From block 223,012,337 (2026-11-04 11:46 UTC, protocol 87), none goes back.
  - Sources: `node thesis/protocol_switch.mjs` → `data/protocol_switch.json`, and the [nearcore 2.14.0 release notes](https://github.com/near/nearcore/releases/tag/2.14.0).
  - On the 61 sampled blocks after that block, the burn runs at about 316,000 NEAR a year (258,000–384,000). That's still about 1% of issuance; any change is too small to see in this sample.
- **So, for a holder today:** supply is set by issuance, not usage.
  - Fee burn would have to grow about 92 times just to cancel issuance.
  - Agent-safe keys are a product edge for NEAR, not yet a supply effect. A holder case built on agent fees needs usage to grow by about two orders of magnitude.
- **One gap in the docs:** the validator docs say 10% of the reward budget goes to a protocol treasury, but mainnet's `protocol_reward_rate` is 0/1 (`data/protocol_config.json`). Our figures measure supply directly, so they don't depend on that split.

## What would change our mind

- **Bullish:** a function-call share above 10% for 3 months running, driven by targets that aren't games or logins.
- **Bearish:** the share falls back under 0.5% once the hackathon ends (watch Nov–Dec 2026).
- **Computed status:** `verdict()` in `lib.mjs` applies these two rules and the November pre-registration to the committed data: **STRENGTHENING, NOT CONFIRMED**. The tests fail if the code and this text disagree. The dashboard lists which rules fire.
- **Next test:** [PREREG-2.md](PREREG-2.md) makes three predictions about blocks from 2026-11-14, 06:00–18:00 UTC, before those blocks exist. If function-call keys sign under 11% of that window's transactions, we drop the "common to use" claim. Its sha256 is timestamped in Bitcoin with [OpenTimestamps](https://opentimestamps.org/) before the window opens (proof: [PREREG-2.md.ots](PREREG-2.md.ots)). `node thesis/check-anchor.mjs` checks that the proof reaches a Bitcoin block mined at least 2 hours before the window.

## Limits

- The data covers Mar–Oct 2026 only. That window fits BigQuery's free tier (1 TB/month); the full history is 7.23 TB per the dry run.
- Counts are actions in action receipts. A key added and then deleted still counts.
- To re-run the BigQuery side you need your own Google Cloud project. `verify.mjs` needs nothing.
- **Intents swap volume is not measured.** The NEAR Intents Explorer API needs a partner JWT we don't have, so we count `intents.near` transactions on chain instead.
- **The transaction sample is 300 blocks.** The intervals above are its uncertainty. A transaction's burn includes the receipts it caused, even in later blocks. The yearly burn uses only the chunks of sampled blocks.
- **The holder figures cover Oct 1 – Nov 12, 2026.** They aren't a forecast. Validator uptime, fee levels and protocol settings can all change.
