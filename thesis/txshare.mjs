// txshare.mjs: how many NEAR transactions are signed with a function-call key, and how much
// NEAR do they burn? Free and keyless: it reads only public FastNEAR endpoints.
//
//   node thesis/txshare.mjs                      re-run the committed sample (same seed, same blocks)
//   node thesis/txshare.mjs --from 2026-11-14T00:00:00Z --to 2026-11-14T18:00:00Z --blocks 300 --seed 1114 --out data/x.json
//   add --resume to continue an interrupted run from its checkpoint (same seed, window and heights)
//
// Method:
//   1. Draw block heights uniformly at random (seeded LCG, so the same seed picks the same heights)
//      between the first block at --from and the first block at --to. A height with no block
//      (skipped) is recorded and not replaced, so every produced block is equally likely.
//   2. Read each sampled block whole (header, every chunk, every transaction) from neardata
//      (https://mainnet.neardata.xyz/v0/block/<height>, FastNEAR's public block archive).
//   3. For each transaction, ask NEAR's archival RPC for the signing key's permission as of the
//      previous block (view_access_key at prev_hash: the state the transaction was checked
//      against), and for its outcome (EXPERIMENTAL_tx_status): gas and NEAR burnt by the
//      transaction and every receipt it caused, in whatever later block they ran.
//      Permissions are cached per (signer, public key) within one run: a key's permission cannot
//      change while it exists, only by deleting the key and adding it again.
//   4. Record each block's total_supply and the balance_burnt of the chunks it produced.
// Output: one JSON file with every sampled block and transaction, so any row can be re-checked.
// The summary (shares and 95% intervals) is computed by lib.mjs from that file, not here.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { lcg } from "./lib.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const FROM = arg("from", "2026-10-01T00:00:00Z"), TO = arg("to", "2026-11-13T00:00:00Z");
const N = Number(arg("blocks", 300)), SEED = Number(arg("seed", 1001));
const OUT = resolve(here, arg("out", "data/txshare_oct1_nov13.json"));
// Two public archival nodes of the same chain; a call that is rate-limited on one goes to the other.
const RPCS = (process.env.NEAR_ARCHIVAL_RPC || "https://archival-rpc.mainnet.fastnear.com,https://archival-rpc.mainnet.near.org").split(",");
const RPC = RPCS.join(",");
const ND = process.env.NEARDATA || "https://mainnet.neardata.xyz";

// Polite pacing: one call at a time per host, spaced to stay near each host's free limit.
const sleep = (t) => new Promise((s) => setTimeout(s, t));
const stats = { rpc: 0, neardata: 0, retries: 0 };
const last = {};
async function paced(host, gap) { const w = (last[host] ?? 0) + gap - Date.now(); if (w > 0) await sleep(w); last[host] = Date.now(); }
// One try: the parsed JSON (neardata answers null for a skipped height), or undefined on
// HTTP 429, 5xx, a timeout or a network error.
async function once(url, init, host, gap) {
  await paced(host, gap);
  stats[host] = (stats[host] ?? 0) + 1;
  try {
    const r = await fetch(url, { ...init, signal: AbortSignal.timeout(30000) }); // no hung request
    if (r.status === 429 || r.status >= 500) { stats.retries++; return undefined; }
    return await r.json();
  } catch { stats.retries++; return undefined; }
}
// An answer about the data (including "no such key") is final; a node-side failure is retried.
const FINAL_ERRORS = new Set(["UNKNOWN_ACCESS_KEY", "UNKNOWN_ACCOUNT", "INVALID_ACCOUNT"]);
const transient = (j) => j.error && !FINAL_ERRORS.has(j.error.cause?.name);
async function rpc(method, params) {
  const init = { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: "tx", method, params }) };
  for (let i = 0; i < 16; i++) {
    const url = RPCS[i % RPCS.length];
    const j = await once(url, init, url, url.includes("fastnear") ? 700 : 300);
    if (j && !transient(j)) return j;
    if (j !== undefined) stats.retries++;
    if (i % RPCS.length === RPCS.length - 1) await sleep(1000 * Math.ceil((i + 1) / RPCS.length));
  }
  throw new Error(`gave up after 16 tries: ${method} ${JSON.stringify(params)}`);
}
async function nd(h) { // null for a skipped height
  for (let i = 0; i < 8; i++) {
    const r = await once(`${ND}/v0/block/${h}`, { redirect: "follow" }, "neardata", 150);
    if (r !== undefined) return r;
    await sleep(2000 * (i + 1));
  }
  throw new Error(`gave up after 8 tries: neardata block ${h}`);
}
const ms = (b) => Number(BigInt(b.block.header.timestamp_nanosec) / 1000000n);

async function heightAt(t) {
  const head = (await rpc("block", { finality: "final" })).result.header;
  if (Number(BigInt(head.timestamp_nanosec) / 1000000n) <= t) return head.height;
  let lo = 9820210, hi = head.height; // 9820210 = mainnet genesis height
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    let probe = mid, b = await nd(probe);
    while (!b && probe < hi) b = await nd(++probe); // skipped heights
    if (!b) { hi = mid; continue; }
    if (ms(b) < t) lo = probe; else hi = mid;
  }
  return hi;
}

const keyCache = new Map();
async function permission(signer, pk, prevHash, hash) {
  const ck = `${signer}|${pk}`;
  if (keyCache.has(ck)) return { ...keyCache.get(ck), cached: true };
  let at = "prev", k = await rpc("query", { request_type: "view_access_key", block_id: prevHash, account_id: signer, public_key: pk });
  if (!k.result || k.result.error) { at = "same"; k = await rpc("query", { request_type: "view_access_key", block_id: hash, account_id: signer, public_key: pk }); }
  const perm = k.result && !k.result.error ? k.result.permission : null;
  const out = { perm, at: perm ? at : null, err: perm ? null : (k.error?.cause?.name ?? k.result?.error ?? "no result") };
  if (perm) keyCache.set(ck, out);
  return out;
}

async function sampleBlock(h) {
  const b = await nd(h);
  if (!b) return null;
  const hd = b.block.header;
  const fresh = b.block.chunks.filter((c) => c.height_included === hd.height);
  const out = { height: h, hash: hd.hash, prev_hash: hd.prev_hash, time: new Date(ms(b)).toISOString(), protocol_version: hd.latest_protocol_version,
    total_supply: hd.total_supply, chunks_new: fresh.length, chunks_all: b.block.chunks.length,
    balance_burnt_new_chunks: fresh.reduce((a, c) => a + BigInt(c.balance_burnt), 0n).toString(), txs: [] };
  for (const sh of b.shards) {
    for (const { transaction: tx } of sh.chunk?.transactions ?? []) {
      const k = await permission(tx.signer_id, tx.public_key, hd.prev_hash, hd.hash).catch((e) => ({ perm: null, at: null, err: e.message }));
      const p = k.perm, known = p === "FullAccess" || !!p?.FunctionCall;
      let s = null, statusError = null; // a transaction both nodes cannot return is recorded, not dropped
      try { s = (await rpc("EXPERIMENTAL_tx_status", { tx_hash: tx.hash, sender_account_id: tx.signer_id, wait_until: "NONE" })).result ?? null; } catch (e) { statusError = e.message; }
      const outs = s ? [s.transaction_outcome, ...s.receipts_outcome] : [];
      out.txs.push({
        hash: tx.hash, shard: sh.shard_id, signer: tx.signer_id, receiver: tx.receiver_id, public_key: tx.public_key,
        key: p === "FullAccess" ? "full" : p?.FunctionCall ? "fc" : "unknown", key_read_at: k.at, ...(k.cached ? { key_cached: true } : {}),
        ...(p && !known ? { permission_raw: p } : {}), ...(k.err ? { key_error: k.err } : {}),
        fc_receiver: p?.FunctionCall?.receiver_id ?? null, fc_methods: p?.FunctionCall?.method_names ?? null,
        actions: tx.actions.map((a) => (typeof a === "string" ? a : Object.keys(a)[0])),
        status: s ? Object.keys(s.status ?? {})[0] ?? null : null, ...(statusError ? { status_error: statusError } : {}),
        gas_burnt: s ? outs.reduce((a, o) => a + o.outcome.gas_burnt, 0) : null,
        tokens_burnt: s ? outs.reduce((a, o) => a + BigInt(o.outcome.tokens_burnt), 0n).toString() : null,
      });
    }
  }
  return out;
}

const t0 = Date.now();
// --resume: reuse the checkpoint of an interrupted run with the same seed and window.
const prev = process.argv.includes("--resume") && existsSync(OUT) ? JSON.parse(readFileSync(OUT, "utf8")) : null;
const resumable = prev?.partial && prev.seed === SEED && prev.window.from === FROM && prev.window.to === TO;
if (prev && !resumable) throw new Error(`${OUT} is not a partial run with seed ${SEED} and this window; not resuming`);
const lo = resumable ? prev.heights.from : await heightAt(Date.parse(FROM)), hi = resumable ? prev.heights.to : await heightAt(Date.parse(TO));
process.stderr.write(`heights ${lo} to ${hi} (${Math.round((Date.now() - t0) / 1000)} s)\n`);
const rand = lcg(SEED);
const heights = Array.from({ length: N }, () => lo + Math.floor(rand() * (hi - lo)));
const blocks = [];
if (resumable) {
  // Rebuild the drawn list in order: a drawn height absent from the checkpoint was a skipped height.
  const have = new Map(prev.blocks.map((b) => [b.height, b]));
  for (let i = 0; i < prev.blocks_drawn; i++) blocks.push(have.get(heights[i]) ?? null);
  for (const [k, v] of Object.entries(prev.run.calls)) stats[k] = (stats[k] ?? 0) + v;
  process.stderr.write(`resuming after ${blocks.length} drawn blocks\n`);
}
const resumedAt = resumable ? blocks.length : null;
const save = (partial) => {
  const got = blocks.filter(Boolean);
  const file = {
    method: "thesis/txshare.mjs (see header comment)", rpc: RPC, neardata: ND, seed: SEED, window: { from: FROM, to: TO },
    heights: { from: lo, to: hi }, blocks_drawn: blocks.length, blocks_skipped: blocks.length - got.length, ...(partial ? { partial: true } : {}),
    run: { started: resumable ? prev.run.started : new Date(t0).toISOString(), seconds: Math.round((Date.now() - t0) / 1000) + (resumable ? prev.run.seconds : 0), calls: stats,
      ...(resumable ? { resumed: [...(prev.run.resumed ?? []), { at: new Date(t0).toISOString(), after_blocks_drawn: resumedAt }] } : {}) },
    blocks: got,
  };
  writeFileSync(OUT, JSON.stringify(file, null, 1) + "\n");
  return file;
};
for (let i = blocks.length; i < N; i++) {
  blocks.push(await sampleBlock(heights[i]));
  if ((i + 1) % 10 === 0) {
    save(true);
    process.stderr.write(`${i + 1}/${N} blocks, ${blocks.reduce((a, b) => a + (b?.txs.length ?? 0), 0)} txs, ${JSON.stringify(stats)}, ${Math.round((Date.now() - t0) / 1000)} s\n`);
  }
}
const file = save(false);
const txs = file.blocks.flatMap((b) => b.txs);
console.log(`${OUT}: ${file.blocks.length} blocks (${file.blocks_skipped} skipped heights), ${txs.length} txs; fc ${txs.filter((t) => t.key === "fc").length}, full ${txs.filter((t) => t.key === "full").length}, unknown ${txs.filter((t) => t.key === "unknown").length}; ${file.run.seconds} s`);
