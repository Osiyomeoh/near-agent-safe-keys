// verify.mjs: check our BigQuery numbers against NEAR itself, with no account and no key.
// For every sampled receipt in data/fc_receivers_sep_oct.json, ask a public archival RPC
// for that receipt and confirm it really adds a FunctionCall key pointing at the claimed
// contract. Also checks every data file against data/SHA256SUMS, and re-reads 20 transactions
// from the txshare.mjs sample (10 function-call-key, 10 full-access, picked by a fixed seed)
// to confirm their signing key's permission as of the block before.
// Usage: node thesis/verify.mjs      (Node 18+, no npm install)

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { lcg } from "./lib.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const RPC = process.env.NEAR_ARCHIVAL_RPC || "https://archival-rpc.mainnet.fastnear.com";
let fail = 0;

// 1. data files match their published hashes
for (const line of readFileSync(join(here, "data/SHA256SUMS"), "utf8").trim().split("\n")) {
  const [want, file] = line.split(/\s+/);
  const got = createHash("sha256").update(readFileSync(join(here, "..", file))).digest("hex");
  console.log(`${got === want ? "OK  " : "FAIL"} sha256 ${file}`);
  if (got !== want) fail++;
}

// 2. sampled receipts exist on chain and say what we counted
async function call(method, params) {
  for (let i = 0; i < 8; i++) {
    const r = await fetch(RPC, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: "v", method, params }) });
    if (r.status === 429) { await new Promise((s) => setTimeout(s, 3000 * (i + 1))); continue; }
    return r.json();
  }
  return { error: "rate limited" };
}
const receipt = (id) => call("EXPERIMENTAL_receipt", { receipt_id: id });
const rows = JSON.parse(readFileSync(join(here, "data/fc_receivers_sep_oct.json"), "utf8"));
let ok = 0, n = 0;
for (const row of rows) {
  for (const id of row.sample_receipts) {
    n++;
    const j = await receipt(id);
    const acts = j.result?.receipt?.Action?.actions ?? [];
    const hit = acts.some((a) => a.AddKey?.access_key?.permission?.FunctionCall?.receiver_id === row.fc_receiver);
    if (hit) ok++; else { fail++; console.log(`FAIL ${id}: expected a FunctionCall key for ${row.fc_receiver}; got ${JSON.stringify(j.error ?? acts).slice(0, 120)}`); }
  }
}
console.log(`${ok}/${n} sampled receipts confirmed on chain via ${RPC}`);

// 3. the transaction-share sample: re-read 20 signing keys at the block before each transaction
const ts = JSON.parse(readFileSync(join(here, "data/txshare_oct1_nov13.json"), "utf8"));
const pool = ts.blocks.flatMap((b) => b.txs.map((t) => ({ ...t, prev_hash: b.prev_hash })));
const pick = (list, k, rand) => { const a = [...list]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a.slice(0, k); };
const rand = lcg(7);
const chosen = [...pick(pool.filter((t) => t.key === "fc" && t.key_read_at === "prev"), 10, rand), ...pick(pool.filter((t) => t.key === "full" && t.key_read_at === "prev"), 10, rand)];
let tok = 0;
for (const t of chosen) {
  const j = await call("query", { request_type: "view_access_key", block_id: t.prev_hash, account_id: t.signer, public_key: t.public_key });
  const p = j.result?.permission;
  const got = p === "FullAccess" ? "full" : p?.FunctionCall ? "fc" : "unknown";
  const same = got === t.key && (got !== "fc" || p.FunctionCall.receiver_id === t.fc_receiver);
  if (same) tok++; else { fail++; console.log(`FAIL tx ${t.hash}: recorded ${t.key} ${t.fc_receiver ?? ""}, chain says ${JSON.stringify(j.error ?? p).slice(0, 120)}`); }
}
console.log(`${tok}/${chosen.length} sampled transaction signing keys confirmed on chain (txshare sample)`);
process.exit(fail ? 1 : 0);
