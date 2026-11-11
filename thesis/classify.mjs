// classify.mjs: what is each top function-call target? Reads public on-chain facts only
// (no account): does the account exist and hold code, and which standard metadata views it answers.
// Usage: node thesis/classify.mjs > thesis/data/targets.json
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const here = dirname(fileURLToPath(import.meta.url));
const RPC = process.env.NEAR_RPC || "https://rpc.mainnet.fastnear.com";
async function q(params) {
  for (let i = 0; i < 8; i++) {
    const r = await fetch(RPC, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: "c", method: "query", params: { finality: "final", ...params } }) });
    if (r.status === 429) { await new Promise((s) => setTimeout(s, 3000 * (i + 1))); continue; }
    return (await r.json()).result;
  }
}
const view = async (id, m) => { const r = await q({ request_type: "call_function", account_id: id, method_name: m, args_base64: "e30=" }); return r?.result ? JSON.parse(Buffer.from(r.result).toString()) : null; };
const rows = JSON.parse(readFileSync(join(here, "data/fc_receivers_sep_oct.json"), "utf8"));
const out = [];
for (const r of rows) {
  const id = r.fc_receiver, acc = await q({ request_type: "view_account", account_id: id });
  const has_code = !!acc && acc.code_hash !== "11111111111111111111111111111111";
  const ft = has_code ? await view(id, "ft_metadata") : null;
  const nft = has_code && !ft ? await view(id, "nft_metadata") : null;
  const src = has_code ? await view(id, "contract_source_metadata") : null;
  out.push({ fc_receiver: id, fc_keys: +r.fc_keys, accounts: +r.accounts, exists: !!acc, has_code, code_hash: acc?.code_hash ?? null,
    ft_symbol: ft?.symbol ?? null, nft_name: nft?.name ?? null, source_link: src?.link ?? null, standards: src?.standards?.map((s) => s.standard) ?? null });
}
console.log(JSON.stringify(out, null, 1));
