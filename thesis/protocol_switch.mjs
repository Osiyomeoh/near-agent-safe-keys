// protocol_switch.mjs: find the first mainnet block of each protocol version in a height range.
// Free, no account, no key. It asks a public archival RPC for EXPERIMENTAL_protocol_config at a
// block and binary-searches the height where protocol_version changes. Used to split the
// transaction-share sample into blocks before and after the 30% contract gas rebate ended
// (protocol 87, nearcore 2.14.0: https://github.com/near/nearcore/releases/tag/2.14.0).
// Usage: node thesis/protocol_switch.mjs [--from 222935426 --to 223320571] [--out data/protocol_switch.json]
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const RPC = process.env.NEAR_ARCHIVAL_RPC || "https://archival-rpc.mainnet.fastnear.com";
const OUT = join(here, arg("--out", "data/protocol_switch.json"));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let calls = 0;

async function call(method, params) {
  for (let i = 0; i < 12; i++) {
    await sleep(800);
    calls++;
    try {
      const r = await fetch(RPC, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: "p", method, params }), signal: AbortSignal.timeout(30000) });
      if (r.status === 429 || r.status >= 500) { await sleep(2000 * (i + 1)); continue; }
      const j = await r.json();
      if (j.error) { await sleep(2000 * (i + 1)); continue; } // skipped height or busy node: caller moves on
      return j.result;
    } catch { await sleep(2000 * (i + 1)); }
  }
  return undefined;
}
// a height can be skipped (no block); walk up to the next produced block
async function at(h) {
  for (let k = 0; k < 20; k++) {
    const blk = await call("block", { block_id: h + k });
    if (!blk) continue;
    const cfg = await call("EXPERIMENTAL_protocol_config", { block_id: blk.header.height });
    if (!cfg) throw new Error(`no protocol config at ${blk.header.height}`);
    return { height: blk.header.height, hash: blk.header.hash, time: new Date(Number(BigInt(blk.header.timestamp_nanosec) / 1000000n)).toISOString(), protocol_version: cfg.protocol_version, burnt_gas_reward: cfg.runtime_config?.transaction_costs?.burnt_gas_reward ?? cfg.burnt_gas_reward ?? null };
  }
  throw new Error(`no block in ${h}..${h + 19}`);
}

let lo = await at(Number(arg("--from", 222935426)));
const hi = await at(Number(arg("--to", 223320571)));
console.log("start", lo, "\nend  ", hi);
const switches = [];
// each step finds the first block whose protocol_version is above lo's
while (lo.protocol_version < hi.protocol_version) {
  let a = lo, b = hi;
  while (b.height - a.height > 1) {
    const m = await at(Math.floor((a.height + b.height) / 2));
    if (m.height >= b.height) break; // only skipped heights between a and b
    if (m.protocol_version > a.protocol_version) b = m; else a = m;
  }
  console.log(`protocol ${a.protocol_version} -> ${b.protocol_version} at block ${b.height} (${b.time})`);
  switches.push({ from: a.protocol_version, to: b.protocol_version, last_block: a, first_block: b });
  lo = b;
}
const out = { source: RPC, method: "EXPERIMENTAL_protocol_config by block_id, binary search", release_notes: "https://github.com/near/nearcore/releases/tag/2.14.0", ran_at: new Date().toISOString(), rpc_calls: calls, switches };
writeFileSync(OUT, JSON.stringify(out, null, 2) + "\n");
console.log(`wrote ${OUT}, ${calls} RPC calls`);
