// check-anchor.mjs: was PREREG-2.md fixed before its window opened? Free, no account, no key.
//   node thesis/check-anchor.mjs                 check the anchor named in ANCHOR below
//   node thesis/check-anchor.mjs --print         print the sha256 and the SocialDB data to anchor
//
// It hashes PREREG-2.md, reads the hash stored under ANCHOR.key in SocialDB (a public contract on
// NEAR) through public RPC, and reads the time of the block that stored it. It passes only if
// the hashes match and that block is older than the window start written in PREREG-2.md.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Filled in after the anchor transaction exists. Until then this script reports NOT ANCHORED.
const ANCHOR = {
  network: "mainnet", // or "testnet"
  account: process.env.ANCHOR_ACCOUNT ?? "[FILL: Sam's NEAR account]",
  key: process.env.ANCHOR_KEY ?? "thesis/prereg/2",
  tx: "[FILL: anchor transaction hash]",
};
const NET = {
  mainnet: { rpc: "https://rpc.mainnet.fastnear.com", archival: "https://archival-rpc.mainnet.fastnear.com", social: "social.near" },
  testnet: { rpc: "https://rpc.testnet.fastnear.com", archival: "https://archival-rpc.testnet.fastnear.com", social: "v1.social08.testnet" },
}[ANCHOR.network];

const file = process.env.PREREG_FILE ?? join(dirname(fileURLToPath(import.meta.url)), "PREREG-2.md");
const text = readFileSync(file, "utf8");
const sha = createHash("sha256").update(text).digest("hex");
const opens = text.match(/Window opens:\*\*\s*`?([0-9T:\-]+Z)`?/)?.[1];

if (process.argv.includes("--print")) {
  console.log(`sha256 ${sha}  PREREG-2.md`);
  console.log(`window opens ${opens ?? "(not found in PREREG-2.md)"}`);
  console.log(`SocialDB data: ${JSON.stringify({ data: { [ANCHOR.account]: { thesis: { prereg: { 2: { sha256: sha } } } } } })}`);
  process.exit(0);
}
if (ANCHOR.account.startsWith("[FILL")) {
  console.log(`NOT ANCHORED yet. sha256 of PREREG-2.md is ${sha}; window opens ${opens}.`);
  process.exit(1);
}

const call = async (url, method, params) => {
  for (let i = 0; i < 6; i++) {
    const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
    if (r.status === 429) { await new Promise((s) => setTimeout(s, 2000 * (i + 1))); continue; }
    return (await r.json()).result;
  }
  throw new Error("RPC rate limit");
};
const args = Buffer.from(JSON.stringify({ keys: [`${ANCHOR.account}/${ANCHOR.key}/**`], options: { with_block_height: true } })).toString("base64");
const res = await call(NET.rpc, "query", { request_type: "call_function", finality: "final", account_id: NET.social, method_name: "get", args_base64: args });
const got = JSON.parse(Buffer.from(res.result).toString());
const node = ANCHOR.key.split("/").reduce((o, k) => o?.[k], got[ANCHOR.account]);
const stored = node?.sha256?.[""], height = node?.sha256?.[":block"];
if (!stored) { console.log(`FAIL no value under ${ANCHOR.account}/${ANCHOR.key} in ${NET.social}`); process.exit(1); }
const blk = await call(NET.archival, "block", { block_id: height });
const at = new Date(Number(BigInt(blk.header.timestamp_nanosec) / 1000000n)).toISOString();
const okHash = stored === sha, okTime = !!opens && at < new Date(opens).toISOString();
console.log(`${okHash ? "OK  " : "FAIL"} sha256 ${sha} ${okHash ? "matches" : `differs from stored ${stored}`}`);
console.log(`${okTime ? "OK  " : "FAIL"} stored in block ${height} at ${at}, ${okTime ? "before" : "NOT before"} the window opened (${opens})`);
console.log(`     ${NET.social} key ${ANCHOR.account}/${ANCHOR.key}, tx ${ANCHOR.tx}`);
process.exit(okHash && okTime ? 0 : 1);
