// rebuild.mjs: one command that rebuilds every number and chart.
//   node thesis/rebuild.mjs           rebuild the dashboard from data/ and verify on chain (no account)
//   node thesis/rebuild.mjs --offline rebuild the dashboard only, no network (what CI checks;
//                                     --out <file> writes it elsewhere, used by the tests)
//   node thesis/rebuild.mjs --query   first re-run the BigQuery queries (needs your own gcloud
//                                     project; about 1.0 TB scanned, about the whole 1 TB monthly free tier)
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { activity, holder, keyMonths, novToDate, summarizeTxShare, targetBuckets, verdict } from "./lib.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const p = (f) => join(here, f);

if (process.argv.includes("--query")) {
  const bq = (sql, fmt, cap) => execFileSync("bq", ["query", "--use_legacy_sql=false", `--format=${fmt}`, "--max_rows=100", `--maximum_bytes_billed=${cap}`], { input: readFileSync(p(sql)), encoding: "utf8", maxBuffer: 1e8 });
  writeFileSync(p("data/keys_by_month_mar_oct.csv"), bq("sql/keys_by_month_mar_oct.sql", "csv", 850e9));
  writeFileSync(p("data/fc_receivers_sep_oct.json"), bq("sql/fc_receivers_sep_oct.sql", "json", 200e9));
  writeFileSync(p("data/activity_by_month.csv"), bq("sql/activity_by_month.sql", "csv", 10e9));
  writeFileSync(p("data/keys_nov_to_date.csv"), bq("sql/keys_nov_to_date.sql", "csv", 35e9));
  writeFileSync(p("data/oct_new_signers.json"), bq("sql/oct_new_signers.sql", "json", 3e9));
  writeFileSync(p("data/SHA256SUMS"), execFileSync("shasum", ["-a", "256", "thesis/data/keys_by_month_mar_oct.csv", "thesis/data/fc_receivers_sep_oct.json", "thesis/data/activity_by_month.csv", "thesis/data/keys_nov_to_date.csv", "thesis/data/oct_new_signers.json", "thesis/data/txshare_oct1_nov13.json", "thesis/data/protocol_config.json", "thesis/data/protocol_switch.json"], { cwd: join(here, ".."), encoding: "utf8" }));
}

const months = keyMonths(readFileSync(p("data/keys_by_month_mar_oct.csv"), "utf8"));
const act = activity(readFileSync(p("data/activity_by_month.csv"), "utf8"));
const nov = novToDate(readFileSync(p("data/keys_nov_to_date.csv"), "utf8"));
const recv = JSON.parse(readFileSync(p("data/fc_receivers_sep_oct.json"), "utf8"));
const targets = JSON.parse(readFileSync(p("data/targets.json"), "utf8"));
const { total: totalKeys, rows: bucketRows } = targetBuckets(targets);
const buckets = bucketRows.map((r) => [r.label, r.keys]);
const sw = JSON.parse(readFileSync(p("data/protocol_switch.json"), "utf8"));
const rebateEnd = sw.switches.find((s) => s.to === 87).first_block; // protocol 87: 30% contract gas rebate ends
const tx = summarizeTxShare(JSON.parse(readFileSync(p("data/txshare_oct1_nov13.json"), "utf8")), { splitHeight: rebateEnd.height });
const hold = holder(tx, JSON.parse(readFileSync(p("data/protocol_config.json"), "utf8")));
const v = verdict({ months, nov });
const prereg = existsSync(p("PREREG-2.md")) ? readFileSync(p("PREREG-2.md"), "utf8") : null;
const pct = (x, d = 1) => `${x.toFixed(d)}%`;
const ci = (r) => `<b>${pct(r.point)}</b> <span class="m">(95% interval ${pct(r.lo)}–${pct(r.hi)})</span>`;

// bar chart of function-call share, inline SVG
const W = 640, H = 240, pad = 36, bw = (W - 2 * pad) / months.length, max = Math.max(...months.map((m) => m.share));
const bars = months.map((m, i) => {
  const h = ((H - 2 * pad) * m.share) / max, x = pad + i * bw, y = H - pad - h;
  return `<rect x="${x + 6}" y="${y}" width="${bw - 12}" height="${h}" fill="var(--bar)"><title>${m.month}: ${m.share.toFixed(2)}%</title></rect>
<text x="${x + bw / 2}" y="${y - 6}" text-anchor="middle">${m.share.toFixed(2)}%</text>
<text x="${x + bw / 2}" y="${H - pad + 16}" text-anchor="middle">${m.month.slice(0, 7)}</text>`;
}).join("\n");
const fmt = (n) => n.toLocaleString("en-US");
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>NEAR Agent-Safe Keys</title><style>
:root{--bg:#fff;--fg:#1a1a1a;--muted:#666;--bar:#2f6fed;--line:#ddd}
@media (prefers-color-scheme:dark){:root{--bg:#121212;--fg:#eee;--muted:#aaa;--bar:#6c9bff;--line:#333}}
body{background:var(--bg);color:var(--fg);font:15px/1.5 system-ui,sans-serif;max-width:760px;margin:0 auto;padding:16px}
svg{width:100%;height:auto}svg text{fill:var(--fg);font-size:11px}table{border-collapse:collapse;width:100%;font-size:13px}
td,th{border-bottom:1px solid var(--line);padding:4px 6px;text-align:right}td:first-child,th:first-child{text-align:left}
code{font-size:12px}.m{color:var(--muted)}</style></head><body>
<h1>NEAR's agent-safe keys: rare to add, common to use, just starting to spread</h1>
<p>Each number comes from the NEAR BigQuery public dataset. Check it with no account: <code>node thesis/verify.mjs</code>, which confirms sampled receipts against NEAR's public archival RPC.</p>
<h2>Function-call keys as a share of all new keys</h2>
<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Function-call key share by month">${bars}</svg>
<p><b>Pre-registered test:</b> before querying November, we committed a prediction that the share would stay at or above 2.0% (<code>PREDICTION.md</code>, commit <code>9d19680</code>). Nov 1–13 came in at <b>${(100 * nov.fc / (nov.fc + nov.full)).toFixed(2)}%</b> (${fmt(nov.fc)} function-call keys, ${fmt(nov.full)} full-access). Query: <code>sql/keys_nov_to_date.sql</code>.</p>
<p>Through October the share stayed under 3%; up about 9× from August to October. Query: <code>sql/keys_by_month_mar_oct.sql</code>.</p>
<table><tr><th>Month</th><th>Full-access</th><th>Function-call</th><th>Share</th><th>Targets</th></tr>
${months.map((m) => `<tr><td>${m.month.slice(0, 7)}</td><td>${fmt(m.add_key_full_access)}</td><td>${fmt(m.add_key_function_call)}</td><td>${m.share.toFixed(2)}%</td><td>${fmt(m.distinct_fc_receivers)}</td></tr>`).join("")}</table>
<h2>Is it just network growth? No.</h2>
<p>From August to October, transactions rose 7% while function-call keys rose 9×. Query: <code>sql/activity_by_month.sql</code>.</p>
<table><tr><th>Month</th><th>Transactions</th><th>Active signers</th><th>Function-call keys per 1M tx</th></tr>
${months.map((m) => { const a = act[m.month]; return `<tr><td>${m.month.slice(0, 7)}</td><td>${fmt(a.tx)}</td><td>${fmt(a.signers)}</td><td>${((1e6 * m.add_key_function_call) / a.tx).toFixed(1)}</td></tr>`; }).join("")}</table>
<h2>Who signs NEAR's transactions?</h2>
<p>Function-call keys are a few percent of new keys, but they sign ${pct(tx.fc_tx_share.point)} of transactions. ${fmt(tx.top_fc_receivers[0].txs)} of those ${fmt(tx.fc_txs)} use a key for <code>${tx.top_fc_receivers[0].fc_receiver}</code>, from ${fmt(tx.top_fc_receivers[0].signers)} signer${tx.top_fc_receivers[0].signers === 1 ? "" : "s"}; in all, ${fmt(tx.fc_signers)} accounts sign this way against ${fmt(tx.full_signers)} with full-access keys. Source: <code>node thesis/txshare.mjs</code>, ${fmt(tx.blocks)} random blocks from ${tx.window.from.slice(0, 10)} to ${tx.window.to.slice(0, 10)} (seed ${tx.seed}), ${fmt(tx.txs)} transactions, each signing key read on chain.</p>
<table><tr><th>Measure (share of sampled transactions)</th><th>Value</th></tr>
<tr><td>Signed with a function-call key</td><td>${ci(tx.fc_tx_share)}</td></tr>
<tr><td>Share of NEAR burnt by those transactions</td><td>${ci(tx.fc_burn_share)}</td></tr>
<tr><td>Signed with a function-call key for Intents or Chain Signatures</td><td>${ci(tx.agent_tx_share)}</td></tr></table>
<p class="m">Intervals resample whole blocks (2,000 draws, fixed seed), because one relayer can fill a block. ${fmt(tx.unknown)} of ${fmt(tx.txs)} transactions had no readable key and are left out.</p>
<table><tr><th>Function-call key for</th><th>Transactions</th><th>Signers</th><th>Example</th></tr>
${tx.top_fc_receivers.slice(0, 10).map((r) => `<tr><td>${r.fc_receiver}</td><td>${fmt(r.txs)}</td><td>${fmt(r.signers)}</td><td><a href="https://nearblocks.io/txns/${r.sample_tx}">tx</a></td></tr>`).join("")}</table>
<h2>What this means for a NEAR holder</h2>
<p>Fees burnt offset about ${pct(hold.burn_offsets_pct_of_minted, 0)} of new issuance, so supply still grows about ${pct(hold.net_growth_pct_year, 2)} a year. Burn would have to grow about ${Math.round(hold.burn_multiple_to_offset_issuance)} times to cancel issuance, so agent-safe keys are not yet a supply effect. This is the status of a thesis, not investment advice.</p>
<table><tr><th>Measure</th><th>Value</th><th>Source</th></tr>
<tr><td>Total supply, ${tx.supply.first.time.slice(0, 10)} → ${tx.supply.last.time.slice(0, 10)}</td><td>${fmt(Math.round(hold.supply_start))} → ${fmt(Math.round(hold.supply_end))} NEAR</td><td>block headers</td></tr>
<tr><td>Net supply growth, annualized</td><td>${pct(hold.net_growth_pct_year, 2)}</td><td>block headers</td></tr>
<tr><td>Issuance cap (max_inflation_rate)</td><td>${pct(hold.cap_pct_year, 1)}</td><td><code>data/protocol_config.json</code></td></tr>
<tr><td>NEAR burnt, annualized</td><td>${fmt(Math.round(hold.burnt_per_year_near))} NEAR (${pct(hold.burnt_pct_supply_year, 3)} of supply)</td><td>chunk headers of sampled blocks</td></tr>
${hold.after_rebate_end ? `<tr><td>NEAR burnt, annualized, only blocks after the 30% contract gas rebate ended (block ${fmt(rebateEnd.height)}, ${rebateEnd.time.slice(0, 16).replace("T", " ")} UTC; ${hold.after_rebate_end.blocks} sampled blocks)</td><td>${fmt(Math.round(hold.after_rebate_end.burnt_per_year_near))} NEAR, about ${pct(hold.after_rebate_end.burn_offsets_pct_of_minted, 1)} of issuance</td><td><code>data/protocol_switch.json</code></td></tr>` : ""}
<tr><td>Share of that burn from function-call-key transactions</td><td>${pct(tx.fc_burn_share.point)}</td><td>transaction outcomes</td></tr></table>
<h2>Thesis status, computed</h2>
<p><b>${v.status}</b>. The rules come from THESIS.md ("What would change our mind") and are applied by <code>verdict()</code> in <code>lib.mjs</code>. This is the status of the thesis, not a buy or sell call.</p>
<table><tr><th>Rule</th><th>Fires?</th></tr>${v.rules.map((r) => `<tr><td>${r.text}</td><td>${r.fired ? "yes" : "no"}</td></tr>`).join("")}</table>
${prereg ? `<h2>Next pre-registered test</h2>
<ul>${[...prereg.matchAll(/^\*\*Prediction \d[^\n]*/gm)].map((m) => `<li>${m[0].replace(/\*\*/g, "").replace(/`([^`]+)`/g, "<code>$1</code>")}</li>`).join("") || "<li>See PREREG-2.md.</li>"}</ul>
<p>Window opens <code>${prereg.match(/Window opens:\*\*\s*`([^`]+)`/)?.[1]}</code>. sha256 of <code>PREREG-2.md</code>: <code>${createHash("sha256").update(prereg).digest("hex")}</code>. Timestamped in Bitcoin with OpenTimestamps before the window (proof <code>PREREG-2.md.ots</code>); check it with <code>node thesis/check-anchor.mjs</code>.</p>` : ""}
<h2>What the top 40 targets actually are</h2>
<p>About 1 key in 9 points at an account with no contract deployed, while agent infrastructure holds under 2%. Source: <code>node thesis/classify.mjs</code> → <code>data/targets.json</code> (on-chain state, 2026-11-11).</p>
<table><tr><th>Target kind (from on-chain facts)</th><th>Keys</th><th>Share</th></tr>
${buckets.map(([k, v]) => `<tr><td>${k}</td><td>${fmt(v)}</td><td>${((100 * v) / totalKeys).toFixed(1)}%</td></tr>`).join("")}</table>
<h2>Where the new function-call keys point (Sep–Oct 2026)</h2>
<p>Mostly a game, staking apps, meme sites and social logins, not agents. Query: <code>sql/fc_receivers_sep_oct.sql</code>.</p>
<table><tr><th>Contract</th><th>Keys</th><th>Accounts</th><th>Check it yourself</th></tr>
${recv.slice(0, 20).map((r) => `<tr><td>${r.fc_receiver}</td><td>${fmt(+r.fc_keys)}</td><td>${fmt(+r.accounts)}</td><td>${r.sample_receipts.map((id, i) => `<a href="https://nearblocks.io/receipts/${id}">r${i + 1}</a>`).join(" ")}</td></tr>`).join("")}</table>
<h2>Check it live, in your browser</h2>
<p>This button asks NEAR's public RPC, from your browser with no account, for each of the 120 sampled receipts. It confirms that each one added the function-call key we counted, then checks whether that key still exists today. It takes one to two minutes: the free public RPC allows only a few requests a second.</p>
<p><button id="go">Verify 120 receipts on NEAR mainnet now</button> <span id="st" class="m"></span></p>
<p id="res"></p>
<script>
const S=${JSON.stringify(recv.map((r) => [r.fc_receiver, r.sample_receipts]))};
const A="https://archival-rpc.mainnet.fastnear.com",L="https://rpc.mainnet.fastnear.com",last={},wait=(ms)=>new Promise((r)=>setTimeout(r,ms));
// The free RPC answers a burst of requests, then about 2 a second. Its rate-limit reply (429) has no CORS header, so a browser sees it as a failed fetch. So: pace each host, retry after a pause, and return null if it never answers.
async function rpc(u,m,p){for(let i=0;i<8;i++){const gap=550-(Date.now()-(last[u]||0));if(gap>0)await wait(gap);last[u]=Date.now();
try{const r=await fetch(u,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({jsonrpc:"2.0",id:1,method:m,params:p})});if(r.ok)return await r.json()}catch(e){}
await wait(1500*(i+1))}return null}
document.getElementById("go").onclick=async(e)=>{e.target.disabled=true;let n=0,ok=0,live=0,gone=0,miss=0;const st=document.getElementById("st");
try{for(const[rcv,ids]of S)for(const id of ids){n++;st.textContent=n+"/120 checked";
const j=await rpc(A,"EXPERIMENTAL_receipt",{receipt_id:id});if(!j){miss++;continue}
const rc=j.result,ak=rc&&rc.receipt.Action&&rc.receipt.Action.actions.find(a=>a.AddKey&&a.AddKey.access_key.permission.FunctionCall&&a.AddKey.access_key.permission.FunctionCall.receiver_id===rcv);
if(!ak)continue;ok++;
const v=await rpc(L,"query",{request_type:"view_access_key",finality:"final",account_id:rc.receiver_id,public_key:ak.AddKey.public_key});
if(!v)miss++;else if(v.result&&!v.result.error)live++;else gone++}}finally{e.target.disabled=false}
document.getElementById("res").innerHTML="<b>"+ok+"/"+n+"</b> receipts confirmed on chain. <b>"+live+"</b> of those keys still exist right now; "+gone+" have been deleted."+(miss?" "+miss+" requests got no answer from the RPC; press the button again.":"")+" (Our run on 2026-11-11 found 120/120 confirmed and 75 still live.)";st.textContent="done at "+new Date().toISOString()}
</script>
<p class="m">Built by <code>node thesis/rebuild.mjs</code>. See THESIS.md for the evidence against and what would change our mind.</p>
</body></html>`;
const outI = process.argv.indexOf("--out"), out = outI > 0 ? process.argv[outI + 1] : p("dashboard/index.html");
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, html);
console.log(`dashboard/index.html rebuilt (${months.length} months, ${recv.length} contracts)`);
if (!process.argv.includes("--offline")) execFileSync("node", [p("verify.mjs")], { stdio: "inherit" });
