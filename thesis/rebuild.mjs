// rebuild.mjs: one command that rebuilds every number and chart.
//   node thesis/rebuild.mjs           rebuild the dashboard from data/ and verify on chain (no account)
//   node thesis/rebuild.mjs --query   first re-run the BigQuery queries (needs your own gcloud
//                                     project; about 0.99 TB scanned, inside the 1 TB monthly free tier)
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
  writeFileSync(p("data/SHA256SUMS"), execFileSync("shasum", ["-a", "256", "thesis/data/keys_by_month_mar_oct.csv", "thesis/data/fc_receivers_sep_oct.json"], { cwd: join(here, ".."), encoding: "utf8" }));
}

const [head, ...lines] = readFileSync(p("data/keys_by_month_mar_oct.csv"), "utf8").trim().split("\n");
const cols = head.split(",");
const months = lines.map((l) => Object.fromEntries(l.split(",").map((v, i) => [cols[i], i ? Number(v) : v])));
for (const m of months) m.share = (100 * m.add_key_function_call) / (m.add_key_function_call + m.add_key_full_access);
const recv = JSON.parse(readFileSync(p("data/fc_receivers_sep_oct.json"), "utf8"));

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
<p>Under 3% even at the peak; up about 9× from August to October. Query: <code>sql/keys_by_month_mar_oct.sql</code>.</p>
<table><tr><th>Month</th><th>Full-access</th><th>Function-call</th><th>Share</th><th>Targets</th></tr>
${months.map((m) => `<tr><td>${m.month.slice(0, 7)}</td><td>${fmt(m.add_key_full_access)}</td><td>${fmt(m.add_key_function_call)}</td><td>${m.share.toFixed(2)}%</td><td>${fmt(m.distinct_fc_receivers)}</td></tr>`).join("")}</table>
<h2>Where the new function-call keys point (Sep–Oct 2026)</h2>
<p>Mostly a game, staking apps, meme sites and social logins, not agents. Query: <code>sql/fc_receivers_sep_oct.sql</code>.</p>
<table><tr><th>Contract</th><th>Keys</th><th>Accounts</th><th>Check it yourself</th></tr>
${recv.slice(0, 20).map((r) => `<tr><td>${r.fc_receiver}</td><td>${fmt(+r.fc_keys)}</td><td>${fmt(+r.accounts)}</td><td>${r.sample_receipts.map((id, i) => `<a href="https://nearblocks.io/receipts/${id}">r${i + 1}</a>`).join(" ")}</td></tr>`).join("")}</table>
<p class="m">Built by <code>node thesis/rebuild.mjs</code>. See THESIS.md for the evidence against and what would change our mind.</p>
</body></html>`;
mkdirSync(p("dashboard"), { recursive: true });
writeFileSync(p("dashboard/index.html"), html);
console.log(`dashboard/index.html rebuilt (${months.length} months, ${recv.length} contracts)`);
execFileSync("node", [p("verify.mjs")], { stdio: "inherit" });
