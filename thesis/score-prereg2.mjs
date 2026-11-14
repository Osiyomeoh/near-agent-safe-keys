// score-prereg2.mjs: scores PREREG-2.md by the rules written in it, with no judgement calls.
//
//   node thesis/score-prereg2.mjs                       score data/txshare_prereg2.json (the pre-registered run)
//   node thesis/score-prereg2.mjs --dry-run --file data/txshare_oct1_nov13.json
//                                                       wiring check on another sample; NOT a PREREG-2 result
//
// Everything it scores against is read from PREREG-2.md itself (window, seed, block count, the three
// bars, the frozen code hashes and the result table), and PREREG-2.md must be the exact file whose
// sha256 is timestamped in Bitcoin (see check-anchor.mjs). Shares come from summarizeTxShare() in
// lib.mjs, as PREREG-2.md says, and are scored on the point estimate.
// Exit codes: 0 scored (whatever the result), 1 the data or code is not what PREREG-2.md fixed,
// 2 the pre-registered run has not been made yet.
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { summarizeTxShare } from "./lib.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const sha = (buf) => createHash("sha256").update(buf).digest("hex");
// The sha256 of PREREG-2.md in the OpenTimestamps proof PREREG-2.md.ots (Bitcoin block 975,705).
export const STAMPED_SHA256 = "b1eb3999362fb691a47706974dc841d027f2df091ed452ae1d86f1f68b4197a0";

// Reads the fixed rules out of PREREG-2.md's text.
export function readPrereg(text) {
  const need = (re, what) => { const m = text.match(re); if (!m) throw new Error(`PREREG-2.md: cannot find ${what}`); return m; };
  const cmd = need(/node thesis\/txshare\.mjs ([^\n]+)/, "the scoring command")[1];
  const flag = (k) => need(new RegExp(`--${k} (\\S+)`), `--${k} in the scoring command`)[1];
  const rows = [...text.matchAll(/^\| (All three hold|1 holds, 2 or 3 fails|1 fails) \| ([^|]+) \|$/gm)].map((m) => ({ when: m[1], meaning: m[2].trim() }));
  if (rows.length !== 3) throw new Error("PREREG-2.md: cannot find the 3-row result table");
  return {
    window: { from: need(/\*\*Window opens:\*\*\s*`([^`]+)`/, "window opens")[1], to: need(/\*\*Window closes:\*\*\s*`([^`]+)`/, "window closes")[1] },
    command: { from: flag("from"), to: flag("to"), blocks: Number(flag("blocks")), seed: Number(flag("seed")), out: flag("out") },
    p1_min: Number(need(/\*\*Prediction 1:\*\*[^\n]*?\*\*at least (\d+(?:\.\d+)?)%\*\*/, "the Prediction 1 bar")[1]),
    p2_min: Number(need(/\*\*Prediction 2:\*\*[^\n]*?\*\*at least (\d+(?:\.\d+)?)%\*\*/, "the Prediction 2 bar")[1]),
    p3_target: need(/\*\*Prediction 3:\*\*\s*`([^`]+)`/, "the Prediction 3 target")[1],
    frozen: Object.fromEntries([...text.matchAll(/`(thesis\/[\w.-]+\.mjs)` sha256 `([0-9a-f]{64})`/g)].map((m) => [m[1], m[2]])),
    rows,
  };
}

// Applies the three predictions to a summarizeTxShare() result. Pure: no files, no network.
export function scorePrereg2(sum, rules) {
  const top = sum.top_fc_receivers, lead = top[0], next = top[1];
  const p1 = { id: "P1", value: sum.fc_tx_share.point, bar: rules.p1_min, holds: sum.fc_tx_share.point >= rules.p1_min };
  const p2 = { id: "P2", value: sum.agent_tx_share.point, bar: rules.p2_min, holds: sum.agent_tx_share.point >= rules.p2_min };
  // "strictly more transactions than any other target": a tie for first fails.
  const p3 = { id: "P3", lead: lead ?? null, next: next ?? null, target: rules.p3_target, holds: !!lead && lead.fc_receiver === rules.p3_target && (!next || lead.txs > next.txs) };
  const row = !p1.holds ? 3 : p2.holds && p3.holds ? 1 : 2;
  return { predictions: [p1, p2, p3], row, ...rules.rows[row - 1] };
}

// Checks that a txshare file is a finished run of exactly the pre-registered command.
export function checkRun(file, rules) {
  const bad = [];
  if (file.partial) bad.push("the run is not finished (partial: true)");
  if (file.window?.from !== rules.window.from || file.window?.to !== rules.window.to) bad.push(`window is ${file.window?.from} to ${file.window?.to}, PREREG-2 fixed ${rules.window.from} to ${rules.window.to}`);
  if (file.window?.from !== rules.command.from || file.window?.to !== rules.command.to) bad.push("the scoring command's --from/--to differ from the window");
  if (file.seed !== rules.command.seed) bad.push(`seed is ${file.seed}, PREREG-2 fixed ${rules.command.seed}`);
  if (file.blocks_drawn !== rules.command.blocks) bad.push(`blocks drawn ${file.blocks_drawn}, PREREG-2 fixed ${rules.command.blocks}`);
  return bad;
}

const pct = (x) => `${x.toFixed(1)}%`;
const fmt = (n) => n.toLocaleString("en-US");

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const arg = (k) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : undefined; };
  const dry = process.argv.includes("--dry-run");
  const preregBuf = readFileSync(join(here, "PREREG-2.md"));
  const fail = (msg) => { console.log(`FAIL ${msg}`); process.exit(1); };
  if (sha(preregBuf) !== STAMPED_SHA256) fail(`PREREG-2.md sha256 is ${sha(preregBuf)}, not the stamped ${STAMPED_SHA256}`);
  const rules = readPrereg(preregBuf.toString("utf8"));
  for (const [f, h] of Object.entries(rules.frozen)) {
    const now = sha(readFileSync(join(here, "..", f)));
    if (now !== h) fail(`${f} sha256 is ${now}, PREREG-2.md froze ${h}. List every change before scoring.`);
  }
  const path = resolve(here, arg("file") ?? rules.command.out);
  if (!existsSync(path)) { console.log(`PENDING ${path.replace(here + "/", "thesis/")} does not exist yet: run the command in PREREG-2.md after ${rules.window.to}`); process.exit(2); }
  const file = JSON.parse(readFileSync(path, "utf8"));
  if (!dry) { const bad = checkRun(file, rules); if (bad.length) fail(`${path} is not the pre-registered run: ${bad.join("; ")}`); }
  const sum = summarizeTxShare(file);
  const r = scorePrereg2(sum, rules);
  const [p1, p2, p3] = r.predictions;
  const mark = (p) => (p.holds ? "HOLDS" : "FAILS");
  console.log(dry
    ? `DRY RUN on ${path.replace(here + "/", "thesis/")}: a wiring check with PREREG-2's rules, NOT the PREREG-2 result`
    : `PREREG-2 scored: ${rules.window.from} to ${rules.window.to}, seed ${file.seed}`);
  console.log(`     ${fmt(file.blocks_drawn)} blocks drawn (${fmt(file.blocks_skipped)} skipped heights), ${fmt(sum.txs)} transactions (${fmt(sum.unknown)} with unknown key type), ${fmt(sum.fc_txs)} signed by function-call keys${file.run?.resumed ? `; resumed ${file.run.resumed.length}x` : ""}`);
  console.log(`OK   PREREG-2.md is the stamped file; ${Object.keys(rules.frozen).join(" and ")} match their frozen sha256`);
  console.log(`${mark(p1)} P1  function-call keys sign ${pct(p1.value)} of transactions (95% interval ${pct(sum.fc_tx_share.lo)}–${pct(sum.fc_tx_share.hi)}); bar: at least ${p1.bar}%`);
  console.log(`${mark(p2)} P2  Intents or Chain Signatures keys sign ${pct(p2.value)} (95% interval ${pct(sum.agent_tx_share.lo)}–${pct(sum.agent_tx_share.hi)}); bar: at least ${p2.bar}%`);
  console.log(`${mark(p3)} P3  most common function-call key target: ${p3.lead ? `${p3.lead.fc_receiver} with ${fmt(p3.lead.txs)} of ${fmt(sum.fc_txs)}` : "none"}${p3.next ? `; next ${p3.next.fc_receiver} with ${fmt(p3.next.txs)}` : ""}; needs ${p3.target}, strictly ahead`);
  console.log(`Result: "${r.when}". ${r.meaning}`);
}
