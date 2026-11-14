# NEAR HACKATHON: Investment Thesis entry (track `thesis`)

**NEAR's agent-safe keys: rare to add, common to use, just starting to spread.**

NEAR accounts can hand out a *function-call key*: it can call one contract, within a gas allowance, and cannot move funds. That is the safest native way to give an AI agent access to an account. We measured how much it is actually used, and we tried to prove ourselves wrong.

- **For:** function-call key additions rose 9× from Aug to Oct 2026 (816 → 7,363) while transactions rose 7%.
- **Out-of-sample:** we committed a prediction (≥ 2.0% of new keys in November) before querying November. The result was **4.44%**.
- **Rare to add, common to use:** function-call keys sign **13.1%** (95% interval 11.2–15.6%) of transactions in 300 random blocks from Oct 1 – Nov 12. Only 29 accounts sign that way, and `intents.near` alone signs two-thirds of them.
- **For a NEAR holder:** supply grows 2.47% a year, set by issuance. Fees burnt offset about 1% of it, so agent usage doesn't move supply yet.
- **Against:** 96–97% of new keys are still full-access, and most of the jump is game and app logins, not agents.
- **Verdict (computed by code from the rules in THESIS.md):** STRENGTHENING, NOT CONFIRMED.
- **Next test, fixed before its blocks exist:** [`thesis/PREREG-2.md`](thesis/PREREG-2.md) predicts the transaction shares for 2026-11-14, 06:00–18:00 UTC. Its sha256 is in Bitcoin block 975,705 (OpenTimestamps), mined 10.3 hours before the window opened.

[![thesis checks](https://github.com/Osiyomeoh/near-agent-safe-keys/actions/workflows/thesis.yml/badge.svg)](https://github.com/Osiyomeoh/near-agent-safe-keys/actions/workflows/thesis.yml) · Dashboard: [osiyomeoh.github.io/near-agent-safe-keys](https://osiyomeoh.github.io/near-agent-safe-keys/) · Read: [`thesis/THESIS.md`](thesis/THESIS.md)

## Check it yourself (Node 18+, no account, no key, no npm install)

| Do this | You'll see | Details |
|---|---|---|
| `node thesis/verify.mjs` | `OK  sha256` for every data file, `120/120 sampled receipts confirmed on chain`, then `20/20 sampled transaction signing keys confirmed on chain` | [thesis/README.md](thesis/README.md) |
| `node --test thesis/test/thesis.test.mjs` | every headline number recomputed from `thesis/data/` and matched against the text | [thesis/test/](thesis/test/) |
| `node thesis/rebuild.mjs --offline` | the dashboard rebuilt from raw data, byte-identical to the committed one | [thesis/rebuild.mjs](thesis/rebuild.mjs) |
| open `thesis/dashboard/index.html`, press **Verify** | your browser re-checks the 120 receipts against NEAR's public RPC | [thesis/dashboard/](thesis/dashboard/) |
| `node thesis/check-anchor.mjs` | whether `PREREG-2.md` was timestamped in a Bitcoin block before its window opened (OpenTimestamps proof, checked against block headers) | [thesis/PREREG-2.md](thesis/PREREG-2.md) |

## What the brief asked for, and where it is

| The brief asks | Where | Honest note |
|---|---|---|
| SQL on the NEAR BigQuery dataset, filtered on `block_date` | [`thesis/sql/`](thesis/sql/) | Every query filters on `block_date`. Dry-run sizes are in the file headers and THESIS.md. |
| Daily active accounts | `sql/activity_by_month.sql` | We report **monthly** distinct signers, not daily, to stay inside the free tier. |
| Transaction counts | `sql/activity_by_month.sql` | Monthly, Mar–Oct 2026. |
| Contract usage | `sql/fc_receivers_sep_oct.sql`, `sql/oct_new_signers.sql` | Which contracts the new keys and new signers point at. |
| NEAR Intents Explorer API pull | **Not used** | It needs a partner JWT we don't have. We measure `intents.near` on chain instead. Swap volume is not measured, and THESIS.md says so. |
| One command that rebuilds every chart from raw data | `node thesis/rebuild.mjs` | `--query` re-runs BigQuery (your own project); `--offline` needs no network. CI checks the output is current. |
| A static dashboard: chart, query behind it, one sentence | [`thesis/dashboard/index.html`](thesis/dashboard/index.html) | One self-contained HTML file, no build step. |
| THESIS.md: claim, for, against, what would change our mind | [`thesis/THESIS.md`](thesis/THESIS.md) | The change-our-mind rules are also code (`verdict()` in `thesis/lib.mjs`). |
| Never invent numbers | `SHA256SUMS`, `verify.mjs`, the tests | Each number traces to a data file from a recorded run. |

## Disclosures

- **Other entry by the same author (NEAR HACKATHON Q-015):** *Supplier Purse*, an AI agent that pays only verified suppliers from a TEE-held NEAR wallet, at [FILL: Supplier Purse repo URL]. The two projects are independent and share no code.
- Written with AI help (Claude Code), then reviewed and run by the author.
- Not investment advice. "Verdict" means the status of this thesis under its own stated rules.
- License: MIT ([`thesis/LICENSE`](thesis/LICENSE)).
