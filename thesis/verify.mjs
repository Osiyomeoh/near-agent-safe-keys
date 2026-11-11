// verify.mjs: check our BigQuery numbers against NEAR itself, with no account and no key.
// For every sampled receipt in data/fc_receivers_sep_oct.json, ask a public archival RPC
// for that receipt and confirm it really adds a FunctionCall key pointing at the claimed
// contract. Also checks every data file against data/SHA256SUMS.
// Usage: node thesis/verify.mjs      (Node 18+, no npm install)

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

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
async function receipt(id) {
  for (let i = 0; i < 8; i++) {
    const r = await fetch(RPC, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: "v", method: "EXPERIMENTAL_receipt", params: { receipt_id: id } }) });
    if (r.status === 429) { await new Promise((s) => setTimeout(s, 3000 * (i + 1))); continue; }
    return r.json();
  }
  return { error: "rate limited" };
}
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
process.exit(fail ? 1 : 0);
