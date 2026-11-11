// live.mjs: is the snapshot still true today? For each sampled receipt, read the key it added
// and ask NEAR (finality "final") whether that key still exists on the account right now.
// No account, no key. Usage: node thesis/live.mjs   (Node 18+)
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const here = dirname(fileURLToPath(import.meta.url));
const ARCH = process.env.NEAR_ARCHIVAL_RPC || "https://archival-rpc.mainnet.fastnear.com";
const LIVE = process.env.NEAR_RPC || "https://rpc.mainnet.fastnear.com";
async function rpc(url, method, params) {
  for (let i = 0; i < 8; i++) {
    const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: "l", method, params }) });
    if (r.status === 429) { await new Promise((s) => setTimeout(s, 3000 * (i + 1))); continue; }
    return r.json();
  }
  return { error: "rate limited" };
}
const rows = JSON.parse(readFileSync(join(here, "data/fc_receivers_sep_oct.json"), "utf8"));
let live = 0, gone = 0, err = 0;
const head = await rpc(LIVE, "block", { finality: "final" });
for (const row of rows) {
  let l = 0;
  for (const id of row.sample_receipts) {
    const rc = (await rpc(ARCH, "EXPERIMENTAL_receipt", { receipt_id: id })).result;
    const ak = rc?.receipt?.Action?.actions?.find((a) => a.AddKey?.access_key?.permission?.FunctionCall)?.AddKey;
    if (!ak) { err++; continue; }
    const v = await rpc(LIVE, "query", { request_type: "view_access_key", finality: "final", account_id: rc.receiver_id, public_key: ak.public_key });
    if (v.result && !v.result.error) { live++; l++; }
    else if (JSON.stringify(v).match(/does not exist|UNKNOWN_ACCESS_KEY|UNKNOWN_ACCOUNT/)) gone++;
    else err++;
  }
  console.log(`${String(l).padStart(1)}/3 still live  ${row.fc_receiver}`);
}
console.log(`\nAt block ${head.result?.header?.height} (${new Date(Number(BigInt(head.result?.header?.timestamp_nanosec ?? 0) / 1000000n)).toISOString()}): ${live} keys still live, ${gone} deleted since, ${err} unreadable, of ${rows.length * 3} sampled.`);
