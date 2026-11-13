// lib.mjs: the pure functions behind every number in THESIS.md and the dashboard.
// No network, no file access: each takes data and returns numbers, so tests/ can check them.

export const AGENT = ["intents.near", "v1.signer"]; // Intents and the Chain Signatures signer

// Deterministic LCG, the same generator as spikes/k4-keyless-sample.mjs.
export function lcg(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
}

// CSV as written by `bq query --format=csv`: first column kept as text, the rest as numbers.
export function parseCsv(text) {
  const [head, ...lines] = text.trim().split("\n");
  const cols = head.split(",");
  return lines.map((l) => Object.fromEntries(l.split(",").map((v, i) => [cols[i], i ? Number(v) : v])));
}

export const share = (fc, full) => (100 * fc) / (fc + full);

export function keyMonths(csvText) {
  return parseCsv(csvText).map((m) => ({ ...m, share: share(m.add_key_function_call, m.add_key_full_access) }));
}

export function activity(csvText) {
  return Object.fromEntries(parseCsv(csvText).map((r) => [r.month, { tx: r.transactions, signers: r.active_signers }]));
}

export function novToDate(csvText) {
  const [head, line] = csvText.trim().split("\n");
  const r = Object.fromEntries(line.split(",").map((v, i) => [head.split(",")[i], v]));
  const fc = Number(r.add_key_function_call), full = Number(r.add_key_full_access);
  return { fc, full, through: r.through, share: share(fc, full) };
}

export function targetBuckets(targets) {
  const sum = (f) => targets.filter(f).reduce((a, t) => a + t.fc_keys, 0);
  const total = sum(() => true);
  const rows = [
    ["No contract deployed (calls fail)", sum((t) => !t.has_code)],
    ["Agent infrastructure (Intents, Chain Signatures)", sum((t) => t.has_code && AGENT.includes(t.fc_receiver))],
    ["Token, NFT or app contracts", sum((t) => t.has_code && !AGENT.includes(t.fc_receiver))],
  ];
  return { total, rows: rows.map(([label, keys]) => ({ label, keys, pct: (100 * keys) / total })) };
}

// 95% Wilson score interval for k successes in n trials, in percent.
export function wilson(k, n, z = 1.96) {
  if (!n) return [NaN, NaN];
  const p = k / n, d = 1 + (z * z) / n, c = p + (z * z) / (2 * n), w = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  return [(100 * (c - w)) / d, (100 * (c + w)) / d];
}

// Ratio of sums over clusters (blocks), with a seeded percentile bootstrap that resamples whole
// blocks. Transactions in one block are not independent (one relayer can fill a block), so a
// per-transaction interval would be too narrow.
export function clusterRatio(clusters, num, den, { B = 2000, seed = 7 } = {}) {
  const n = clusters.length, nums = clusters.map(num), dens = clusters.map(den);
  const tot = (a) => a.reduce((x, y) => x + y, 0);
  const point = (100 * tot(nums)) / tot(dens);
  const rand = lcg(seed), est = [];
  for (let b = 0; b < B; b++) {
    let sn = 0, sd = 0;
    for (let i = 0; i < n; i++) { const j = Math.floor(rand() * n); sn += nums[j]; sd += dens[j]; }
    if (sd > 0) est.push((100 * sn) / sd);
  }
  est.sort((a, b) => a - b);
  return { point, lo: est[Math.floor(0.025 * est.length)], hi: est[Math.ceil(0.975 * est.length) - 1] };
}

export const near = (yocto) => Number(BigInt(yocto) / 10n ** 12n) / 1e12; // yoctoNEAR (1e-24) -> NEAR

// Summary of a txshare.mjs output file.
// splitHeight (optional): first block of protocol 87, when the 30% contract gas rebate ended
// (data/protocol_switch.json). Burn is then also measured on the sampled blocks from that height on.
export function summarizeTxShare(file, { splitHeight } = {}) {
  const blocks = file.blocks;
  const txs = blocks.flatMap((b) => b.txs);
  const known = txs.filter((t) => t.key !== "unknown");
  const burnt = (t) => (t.tokens_burnt ? near(t.tokens_burnt) : 0);
  const isFc = (t) => t.key === "fc";
  const isAgent = (t) => isFc(t) && AGENT.includes(t.fc_receiver);
  const per = (f) => (b) => b.txs.filter((t) => t.key !== "unknown" && f(t)).length;
  const perBurn = (f) => (b) => b.txs.filter((t) => t.key !== "unknown" && f(t)).reduce((a, t) => a + burnt(t), 0);
  const all = () => true;
  const byRecv = {};
  for (const t of txs.filter(isFc)) {
    const r = (byRecv[t.fc_receiver] ??= { fc_receiver: t.fc_receiver, txs: 0, signers: new Set(), near_burnt: 0, sample_tx: t.hash, sample_signer: t.signer });
    r.txs++; r.signers.add(t.signer); r.near_burnt += burnt(t);
  }
  const top = Object.values(byRecv).map((r) => ({ ...r, signers: r.signers.size })).sort((a, b) => b.txs - a.txs);
  const fcTx = known.filter(isFc);
  const sorted = [...blocks].sort((a, b) => a.height - b.height), first = sorted[0], last = sorted.at(-1);
  return {
    window: file.window, seed: file.seed, blocks: blocks.length, blocks_skipped: file.blocks_skipped,
    txs: txs.length, known: known.length, unknown: txs.length - known.length,
    fc_txs: fcTx.length, full_txs: known.length - fcTx.length,
    fc_tx_share: clusterRatio(blocks, per(isFc), per(all)),
    fc_burn_share: clusterRatio(blocks, perBurn(isFc), perBurn(all)),
    agent_tx_share: clusterRatio(blocks, per(isAgent), per(all)),
    fc_signers: new Set(fcTx.map((t) => t.signer)).size,
    full_signers: new Set(known.filter((t) => !isFc(t)).map((t) => t.signer)).size,
    near_burnt_sample: known.reduce((a, t) => a + burnt(t), 0),
    top_fc_receivers: top,
    // Supply: total_supply header field at the first and last sampled block, and the chunk-header
    // balance_burnt per sampled block, scaled to every block between them.
    supply: {
      first: { height: first.height, time: first.time, near: near(first.total_supply) },
      last: { height: last.height, time: last.time, near: near(last.total_supply) },
      change_near: near(last.total_supply) - near(first.total_supply),
      burnt_per_block_near: blocks.reduce((a, b) => a + near(b.balance_burnt_new_chunks), 0) / blocks.length,
      // Same mean with a block bootstrap interval.
      burnt_per_block_ci: burnCi(blocks),
      after_rebate_end: ((after) => (after.length ? { from_height: splitHeight, blocks: after.length, burnt_per_block_ci: burnCi(after) } : null))(splitHeight ? blocks.filter((b) => b.height >= splitHeight) : []),
    },
  };
}

// Mean chunk-header balance_burnt per block with a block bootstrap interval (clusterRatio
// returns percent, hence / 100).
const burnCi = (blocks) => (({ point, lo, hi }) => ({ point: point / 100, lo: lo / 100, hi: hi / 100 }))(clusterRatio(blocks, (b) => near(b.balance_burnt_new_chunks), () => 1));

// What the sample says about supply, for a NEAR holder. Inputs: summarizeTxShare(file) and the
// protocol settings in data/protocol_config.json. A 365-day year (31,536,000 s) throughout.
export function holder(sum, cfg) {
  const YEAR = 365 * 86400;
  const { first, last, change_near, burnt_per_block_near } = sum.supply;
  const secs = (Date.parse(last.time) - Date.parse(first.time)) / 1000;
  const producedShare = sum.blocks / (sum.blocks + sum.blocks_skipped); // drawn heights that held a block
  const blocksPerSec = ((last.height - first.height) / secs) * producedShare;
  const burntPerYear = burnt_per_block_near * blocksPerSec * YEAR;
  const ci = sum.supply.burnt_per_block_ci;
  const burntInWindow = burnt_per_block_near * blocksPerSec * secs;
  const [num, den] = cfg.fields.max_inflation_rate;
  const mintedPerYear = ((change_near + burntInWindow) * YEAR) / secs;
  const after = sum.supply.after_rebate_end;
  const perYear = (x) => x * blocksPerSec * YEAR;
  return {
    days: secs / 86400,
    supply_start: first.near, supply_end: last.near, change_near,
    net_growth_pct_year: (100 * change_near * YEAR) / secs / first.near,
    cap_pct_year: (100 * num) / den,
    blocks_per_sec: blocksPerSec,
    burnt_per_year_near: burntPerYear,
    burnt_per_year_range: [ci.lo * blocksPerSec * YEAR, ci.hi * blocksPerSec * YEAR],
    burnt_pct_supply_year: (100 * burntPerYear) / first.near,
    // Minted = what the supply grew by plus what was burnt over the same blocks.
    minted_pct_year: (100 * (change_near + burntInWindow) * YEAR) / secs / first.near,
    burn_offsets_pct_of_minted: (100 * burntInWindow) / (change_near + burntInWindow),
    // How many times larger the burn would have to be to cancel issuance (net growth zero).
    burn_multiple_to_offset_issuance: (change_near + burntInWindow) / burntInWindow,
    // The same burn rate measured only on sampled blocks after the rebate ended (protocol 87).
    after_rebate_end: after && after.blocks ? {
      from_height: after.from_height, blocks: after.blocks,
      burnt_per_year_near: perYear(after.burnt_per_block_ci.point),
      burnt_per_year_range: [perYear(after.burnt_per_block_ci.lo), perYear(after.burnt_per_block_ci.hi)],
      burn_offsets_pct_of_minted: (100 * perYear(after.burnt_per_block_ci.point)) / mintedPerYear,
    } : null,
  };
}

// Thesis status as code. Rules are fixed in THESIS.md ("What would change our mind"); this
// returns which rules fire on the data given, never a buy or sell call.
export function verdict({ months, nov }) {
  const last3 = months.slice(-3).map((m) => m.share);
  const rules = [
    { id: "bull_adoption", text: "Function-call share of new keys above 10% for 3 months running", fired: last3.length === 3 && last3.every((s) => s > 10) },
    { id: "bear_collapse", text: "Function-call share of new keys back under 0.5% after the hackathon", fired: nov.share < 0.5 },
    { id: "prereg_nov", text: "Pre-registered: November share at or above 2.0%", fired: nov.share >= 2.0 },
  ];
  const f = Object.fromEntries(rules.map((r) => [r.id, r.fired]));
  const status = f.bear_collapse ? "WEAKENING" : f.bull_adoption ? "CONFIRMED" : f.prereg_nov ? "STRENGTHENING, NOT CONFIRMED" : "UNCHANGED";
  return { status, rules };
}
