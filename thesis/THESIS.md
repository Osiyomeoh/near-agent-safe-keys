# NEAR's agent-safe keys: real, almost unused, and just starting to move

> **In 30 seconds**
> - **Claim:** NEAR's function-call keys are the safest way to give an AI agent access to an account, and they are built into NEAR's account model. On Ethereum and similar chains, the same thing usually needs a smart-contract wallet with session keys. Builders have just started to use them.
> - **For:** function-call key additions rose 9× from Aug to Oct 2026 (816 → 7,363), and their share of new keys rose from 0.01% to 2.69%.
> - **Not just growth:** transactions rose 7% over the same months.
> - **Against:** 97% of new keys are still full-access. Only 1.8% of function-call keys point at agent infrastructure (Intents, Chain Signatures), 11% point at accounts with no contract, and 45 of 120 sampled keys were deleted within weeks.
> - **Verdict:** the moat is real but not yet in use. Watch Nov–Dec: if the share holds above 2% without hackathon traffic, the thesis strengthens.
> - **Check it:** run `node thesis/verify.mjs`, or open the dashboard and press **Verify**. No account is needed.

**The claim.** On NEAR, any account can natively hand out a key that can call only one contract, with a gas allowance, and can't move funds: a *function-call access key*. That is the safest way to give an AI agent or an app access to an account. If agents are going to hold money, this feature is a long-term edge for NEAR. **The data says the edge is real but almost unused. It started to move in Sep–Oct 2026, and most of that move is game and app logins, not agents.**

Check every number yourself, with no account: `node thesis/verify.mjs`.
- It checks each data file against `data/SHA256SUMS`.
- It confirms 120 sampled receipts (3 for each of the top 40 contracts) against NEAR's public archival RPC.
- Last run: **120/120 confirmed**, OK on both hashes.

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

## Evidence for

- **Function-call key additions rose about 9× from August to October** (816 → 7,363).
- **Distinct target contracts rose about 8× from August to September** (165 → 1,348). The feature is being used by more builders, not just more often.
- **It isn't just network growth.** Monthly transactions were nearly flat from Aug to Oct (21.1M → 22.6M, +7%), while function-call keys rose 9×. Per million transactions, that's 38.6 → 325.4. Source: `data/activity_by_month.csv`, from `sql/activity_by_month.sql` (7.77 GB scanned).
- **Builder interest is visible in this hackathon:** 56 of the 137 GitHub repos linked from NEAR HACKATHON demo posts mention function-call keys. This is interest, not usage. Counted with `research/` scripts on Nov 11, 2026.

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

- **October also had an unexplained signer jump:** 826,700 distinct signers against 302,272 in September (2.7×), while transactions barely moved. Something brought in many one-off signers. We haven't identified it, and it could be linked to the key rise.

## What would change our mind

- **Bullish:** a function-call share above 10% for 3 months running, driven by targets that aren't games or logins.
- **Bearish:** the share falls back under 0.5% once the hackathon ends (watch Nov–Dec 2026).

## Limits

- The data covers Mar–Oct 2026 only. That window fits BigQuery's free tier (1 TB/month); the full history is 7.23 TB per the dry run.
- Counts are actions in action receipts. A key added and then deleted still counts.
- To re-run the BigQuery side you need your own Google Cloud project. `verify.mjs` needs nothing.
