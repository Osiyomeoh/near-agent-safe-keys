# Pre-registered prediction

Written and committed **before** any November 2026 data was queried. The git commit time of this file is the proof.

**Prediction:** for blocks from 2026-11-01 to the latest date in BigQuery, the function-call share of new keys, which is function-call ÷ (function-call + full-access), is **at least 2.0%**. October was 2.69%.

| Result | What it means for the thesis |
|---|---|
| ≥ 2.0% | Holds. The Sep–Oct rise was not a one-month blip |
| 0.5% – 2.0% | Weakened. The rise is fading |
| < 0.5% | Wrong. Back to the pre-September level; the thesis's bearish trigger |

- **Query:** `sql/keys_nov_to_date.sql`. The dry run scans 30.5 GB.
- **Caveat stated in advance:** November overlaps the hackathon, so builder testing may inflate the number. That's why the main bearish test stays Nov–Dec, after the hackathon.
- **Result:** filled in below by a later commit, whatever it shows.

## Result (queried 2026-11-13, after the prediction commit `9d19680`)

| Window | Function-call keys | Full-access keys | Share |
|---|---:|---:|---:|
| 2026-11-01 → 2026-11-13 (last day partial) | 11,556 | 248,736 | **4.44%** |

**The prediction held.** The share rose from 2.69% in October to 4.44% in November. In under two weeks, November already has more function-call keys than all of October (7,363).
- Data: `data/keys_nov_to_date.csv`, checked by `SHA256SUMS`.
- Caveat, as stated in advance: November overlaps the hackathon. The post-hackathon test in Nov–Dec still decides.
