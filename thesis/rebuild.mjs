// rebuild.mjs: one command that rebuilds every number and chart.
//   node thesis/rebuild.mjs           rebuild the dashboard from data/ and verify on chain (no account)
//   node thesis/rebuild.mjs --query   first re-run the BigQuery queries (needs your own gcloud
//                                     project; about 1.0 TB scanned, about the whole 1 TB monthly free tier)
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const p = (f) => join(here, f);

if (process.argv.includes("--query")) {
  const bq = (sql, fmt, cap) => execFileSync("bq", ["query", "--use_legacy_sql=false", `--format=${fmt}`, "--max_rows=100", `--maximum_bytes_billed=${cap}`], { input: readFileSync(p(sql)), encoding: "utf8", maxBuffer: 1e8 });
  writeFileSync(p("data/keys_by_month_mar_oct.csv"), bq("sql/keys_by_month_mar_oct.sql", "csv", 850e9));
  writeFileSync(p("data/fc_receivers_sep_oct.json"), bq("sql/fc_receivers_sep_oct.sql", "json", 200e9));
  writeFileSync(p("data/activity_by_month.csv"), bq("sql/activity_by_month.sql", "csv", 10e9));
  writeFileSync(p("data/keys_nov_to_date.csv"), bq("sql/keys_nov_to_date.sql", "csv", 35e9));
  writeFileSync(p("data/oct_new_signers.json"), bq("sql/oct_new_signers.sql", "json", 3e9));
  writeFileSync(p("data/SHA256SUMS"), execFileSync("shasum", ["-a", "256", "thesis/data/keys_by_month_mar_oct.csv", "thesis/data/fc_receivers_sep_oct.json", "thesis/data/activity_by_month.csv", "thesis/data/keys_nov_to_date.csv", "thesis/data/oct_new_signers.json"], { cwd: join(here, ".."), encoding: "utf8" }));
}

const [head, ...lines] = readFileSync(p("data/keys_by_month_mar_oct.csv"), "utf8").trim().split("\n");
const cols = head.split(",");
const months = lines.map((l) => Object.fromEntries(l.split(",").map((v, i) => [cols[i], i ? Number(v) : v])));
for (const m of months) m.share = (100 * m.add_key_function_call) / (m.add_key_function_call + m.add_key_full_access);
const [ah, ...al] = readFileSync(p("data/activity_by_month.csv"), "utf8").trim().split("\n");
const act = Object.fromEntries(al.map((l) => { const [m, tx, sg] = l.split(","); return [m, { tx: +tx, signers: +sg }]; }));
const [, nl] = readFileSync(p("data/keys_nov_to_date.csv"), "utf8").trim().split("\n");
const nov = { fc: +nl.split(",")[0], full: +nl.split(",")[1] };
const recv = JSON.parse(readFileSync(p("data/fc_receivers_sep_oct.json"), "utf8"));
const targets = JSON.parse(readFileSync(p("data/targets.json"), "utf8"));
const sum = (f) => targets.filter(f).reduce((a, t) => a + t.fc_keys, 0), totalKeys = sum(() => true);
const AGENT = ["intents.near", "v1.signer"];
const buckets = [
  ["No contract deployed (calls fail)", sum((t) => !t.has_code)],
  ["Agent infrastructure (Intents, Chain Signatures)", sum((t) => t.has_code && AGENT.includes(t.fc_receiver))],
  ["Token, NFT or app contracts", sum((t) => t.has_code && !AGENT.includes(t.fc_receiver))],
];

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
<h1>NEAR's agent-safe keys: real, almost unused, just starting to move</h1>
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
<h2>What the top 40 targets actually are</h2>
<p>About 1 key in 9 points at an account with no contract deployed, while agent infrastructure holds under 2%. Source: <code>node thesis/classify.mjs</code> → <code>data/targets.json</code> (on-chain state, 2026-11-11).</p>
<table><tr><th>Target kind (from on-chain facts)</th><th>Keys</th><th>Share</th></tr>
${buckets.map(([k, v]) => `<tr><td>${k}</td><td>${fmt(v)}</td><td>${((100 * v) / totalKeys).toFixed(1)}%</td></tr>`).join("")}</table>
<h2>Where the new function-call keys point (Sep–Oct 2026)</h2>
<p>Mostly a game, staking apps, meme sites and social logins, not agents. Query: <code>sql/fc_receivers_sep_oct.sql</code>.</p>
<table><tr><th>Contract</th><th>Keys</th><th>Accounts</th><th>Check it yourself</th></tr>
${recv.slice(0, 20).map((r) => `<tr><td>${r.fc_receiver}</td><td>${fmt(+r.fc_keys)}</td><td>${fmt(+r.accounts)}</td><td>${r.sample_receipts.map((id, i) => `<a href="https://nearblocks.io/receipts/${id}">r${i + 1}</a>`).join(" ")}</td></tr>`).join("")}</table>
<h2>Check it live, in your browser</h2>
<p>This button asks NEAR's public RPC, from your browser with no account, for each of the 120 sampled receipts. It confirms that each one added the function-call key we counted, then checks whether that key still exists today.</p>
<p><button id="go">Verify 120 receipts on NEAR mainnet now</button> <span id="st" class="m"></span></p>
<p id="res"></p>
<script>
const S=${JSON.stringify(recv.map((r) => [r.fc_receiver, r.sample_receipts]))};
const A="https://archival-rpc.mainnet.fastnear.com",L="https://rpc.mainnet.fastnear.com";
async function rpc(u,m,p){for(let i=0;i<8;i++){const r=await fetch(u,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({jsonrpc:"2.0",id:1,method:m,params:p})});if(r.status===429){await new Promise(s=>setTimeout(s,2000*(i+1)));continue}return r.json()}return{}}
document.getElementById("go").onclick=async(e)=>{e.target.disabled=true;let n=0,ok=0,live=0;const st=document.getElementById("st");
for(const[rcv,ids]of S)for(const id of ids){n++;st.textContent=n+"/120 checked";
const rc=(await rpc(A,"EXPERIMENTAL_receipt",{receipt_id:id})).result;
const ak=rc&&rc.receipt.Action&&rc.receipt.Action.actions.find(a=>a.AddKey&&a.AddKey.access_key.permission.FunctionCall&&a.AddKey.access_key.permission.FunctionCall.receiver_id===rcv);
if(!ak)continue;ok++;
const v=await rpc(L,"query",{request_type:"view_access_key",finality:"final",account_id:rc.receiver_id,public_key:ak.AddKey.public_key});
if(v.result&&!v.result.error)live++}
document.getElementById("res").innerHTML="<b>"+ok+"/"+n+"</b> receipts confirmed on chain. <b>"+live+"</b> of those keys still exist right now; "+(ok-live)+" have been deleted. (Our run on 2026-11-11 found 120/120 confirmed and 75 still live.)";st.textContent="done at "+new Date().toISOString()}
</script>
<p class="m">Built by <code>node thesis/rebuild.mjs</code>. See THESIS.md for the evidence against and what would change our mind.</p>
</body></html>`;
mkdirSync(p("dashboard"), { recursive: true });
writeFileSync(p("dashboard/index.html"), html);
console.log(`dashboard/index.html rebuilt (${months.length} months, ${recv.length} contracts)`);
execFileSync("node", [p("verify.mjs")], { stdio: "inherit" });
