// Unit tests: every headline number in THESIS.md is recomputed from the committed data files
// and checked against the text, so the prose cannot drift from the data.
// Run: node --test thesis/test/thesis.test.mjs   (Node 18+, no network, no npm install)
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { activity, clusterRatio, holder, keyMonths, lcg, novToDate, share, summarizeTxShare, targetBuckets, verdict, wilson } from "../lib.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (f) => readFileSync(join(root, f), "utf8");
const months = keyMonths(read("thesis/data/keys_by_month_mar_oct.csv"));
const m = Object.fromEntries(months.map((x) => [x.month.slice(0, 7), x]));
const act = activity(read("thesis/data/activity_by_month.csv"));
const nov = novToDate(read("thesis/data/keys_nov_to_date.csv"));
const thesis = read("thesis/THESIS.md");
const fmt = (n) => n.toLocaleString("en-US");
const txFile = JSON.parse(read("thesis/data/txshare_oct1_nov13.json"));
const rebateEnd = JSON.parse(read("thesis/data/protocol_switch.json")).switches.find((s) => s.to === 87).first_block;
const tx = summarizeTxShare(txFile, { splitHeight: rebateEnd.height });
const hold = holder(tx, JSON.parse(read("thesis/data/protocol_config.json")));

test("data files match SHA256SUMS", () => {
  const lines = read("thesis/data/SHA256SUMS").trim().split("\n");
  assert.ok(lines.length >= 5);
  for (const l of lines) {
    const [hash, file] = l.split(/\s+/);
    assert.equal(createHash("sha256").update(readFileSync(join(root, file))).digest("hex"), hash, file);
  }
});

test("monthly function-call share matches the THESIS.md table", () => {
  assert.equal(months.length, 8);
  for (const x of months) {
    const row = `| ${new Date(x.month).toLocaleString("en-US", { month: "short", timeZone: "UTC" })} | ${fmt(x.add_key_full_access)} | ${fmt(x.add_key_function_call)} | ${x.share.toFixed(2)}% | ${fmt(x.create_account_actions)} | ${fmt(x.distinct_fc_receivers)} |`;
    assert.ok(thesis.includes(row), `missing row: ${row}`);
  }
});

test("Aug to Oct: function-call keys about 9x, targets about 8x Aug to Sep", () => {
  const keys = m["2026-10"].add_key_function_call / m["2026-08"].add_key_function_call;
  assert.equal(Math.round(keys), 9);
  assert.ok(thesis.includes(`(${fmt(m["2026-08"].add_key_function_call)} → ${fmt(m["2026-10"].add_key_function_call)})`));
  assert.equal(Math.round(m["2026-09"].distinct_fc_receivers / m["2026-08"].distinct_fc_receivers), 8);
  assert.ok(thesis.includes("(165 → 1,348)"));
  assert.ok(thesis.includes(`from ${m["2026-08"].share.toFixed(2)}% to ${m["2026-10"].share.toFixed(2)}%`) || thesis.includes(`0.01% to ${m["2026-10"].share.toFixed(2)}%`));
});

test("not just growth: transactions +7%, keys per 1M tx 38.6 -> 325.4", () => {
  const a = act["2026-08-01"], o = act["2026-10-01"];
  assert.equal(Math.round(100 * (o.tx / a.tx - 1)), 7);
  const per = (k) => ((1e6 * m[k].add_key_function_call) / act[`${k}-01`].tx).toFixed(1);
  assert.equal(per("2026-08"), "38.6");
  assert.equal(per("2026-10"), "325.4");
  assert.ok(thesis.includes("38.6 → 325.4"));
  assert.ok(thesis.includes(`(${(a.tx / 1e6).toFixed(1)}M → ${(o.tx / 1e6).toFixed(1)}M, +7%)`));
});

test("pre-registered November test: 4.44% against a bar of 2.0%", () => {
  assert.equal(nov.fc, 11556);
  assert.equal(nov.full, 248736);
  assert.equal(nov.share.toFixed(2), "4.44");
  assert.ok(nov.share >= 2.0);
  assert.ok(read("thesis/PREDICTION.md").includes("**4.44%**"));
  assert.ok(thesis.includes("**4.44%**"));
});

test("top-40 target buckets: 164 agent-infra keys (1.8%), 1,048 no-code keys (11%)", () => {
  const { total, rows } = targetBuckets(JSON.parse(read("thesis/data/targets.json")));
  assert.equal(total, 9291);
  const [noCode, agent] = rows;
  assert.equal(agent.keys, 164);
  assert.equal(agent.pct.toFixed(1), "1.8");
  assert.equal(noCode.keys, 1048);
  assert.equal(Math.round(noCode.pct), 11);
  assert.ok(thesis.includes("**164 keys, 1.8%**") && thesis.includes("1,048 keys"));
});

test("Sep-Oct receivers file: 40 contracts, 3 sample receipts each (what verify.mjs checks)", () => {
  const recv = JSON.parse(read("thesis/data/fc_receivers_sep_oct.json"));
  assert.equal(recv.length, 40);
  assert.ok(recv.every((r) => r.sample_receipts.length === 3));
  assert.equal(recv[0].fc_receiver, "aa-harvest-moon.near");
  assert.equal(+recv[0].fc_keys, 3433);
});

test("share, wilson and the cluster bootstrap behave", () => {
  assert.equal(share(1, 3), 25);
  const [lo, hi] = wilson(50, 100);
  assert.ok(lo > 40 && lo < 41 && hi > 59 && hi < 60);
  const same = Array.from({ length: 50 }, () => ({ a: 2, b: 4 }));
  const r = clusterRatio(same, (c) => c.a, (c) => c.b, { B: 200 });
  assert.equal(r.point, 50);
  assert.equal(r.lo, 50);
  assert.equal(r.hi, 50);
  const g1 = lcg(1001), g2 = lcg(1001);
  assert.deepEqual([g1(), g1(), g1()], [g2(), g2(), g2()]);
});

test("verdict as code: rules from THESIS.md, applied to the committed data", () => {
  const v = verdict({ months, nov });
  assert.equal(v.status, "STRENGTHENING, NOT CONFIRMED");
  assert.ok(v.rules.find((r) => r.id === "prereg_nov").fired);
  assert.ok(!v.rules.find((r) => r.id === "bull_adoption").fired);
  assert.ok(!v.rules.find((r) => r.id === "bear_collapse").fired);
  // Rule wiring on made-up inputs (test inputs only, not data):
  const hi = [{ share: 11 }, { share: 12 }, { share: 13 }];
  assert.equal(verdict({ months: hi, nov: { share: 12 } }).status, "CONFIRMED");
  assert.equal(verdict({ months: hi, nov: { share: 0.4 } }).status, "WEAKENING");
});

test("transaction-share sample is complete and quoted correctly in THESIS.md", () => {
  assert.ok(!txFile.partial, "txshare file is a finished run");
  assert.equal(txFile.seed, 1001);
  assert.equal(txFile.blocks_drawn, 300);
  assert.equal(tx.blocks + tx.blocks_skipped, 300);
  const q = (r) => `**${r.point.toFixed(1)}%** (95% interval ${r.lo.toFixed(1)}–${r.hi.toFixed(1)}%)`;
  assert.ok(thesis.includes(q(tx.fc_tx_share)), `THESIS.md should quote ${q(tx.fc_tx_share)}`);
  assert.ok(thesis.includes(q(tx.fc_burn_share)), `THESIS.md should quote ${q(tx.fc_burn_share)}`);
  assert.ok(thesis.includes(q(tx.agent_tx_share)), `THESIS.md should quote ${q(tx.agent_tx_share)}`);
  assert.ok(thesis.includes(`${fmt(tx.txs)} transactions`));
});

test("holder view: supply growth, cap and burn as quoted in THESIS.md", () => {
  assert.equal(hold.cap_pct_year, 2.5);
  assert.ok(hold.net_growth_pct_year > 0 && hold.net_growth_pct_year <= hold.cap_pct_year, "net growth within the cap");
  assert.ok(thesis.includes(`${hold.net_growth_pct_year.toFixed(2)}% a year`));
  assert.ok(thesis.includes(`${fmt(Math.round(hold.burnt_per_year_near / 1000) * 1000)} NEAR`));
  assert.ok(thesis.includes(`about ${Math.round(hold.burn_offsets_pct_of_minted)}% of new issuance`));
  assert.ok(thesis.includes(`about ${Math.round(hold.burn_multiple_to_offset_issuance)} times`));
  assert.ok(Math.abs(hold.minted_pct_year - hold.cap_pct_year) < 0.05, "growth plus burn is within 0.05 points of the cap");
  assert.ok(thesis.includes(`${hold.minted_pct_year.toFixed(2)}% a year`));
});

test("rebate end: protocol 87 switch block and the burn after it, as quoted in THESIS.md", () => {
  const s = JSON.parse(read("thesis/data/protocol_switch.json")).switches.find((x) => x.to === 87);
  assert.deepEqual(s.last_block.burnt_gas_reward, [3, 10], "30% rebate before the switch");
  assert.deepEqual(s.first_block.burnt_gas_reward, [0, 1], "no rebate from the switch on");
  assert.equal(s.first_block.height - s.last_block.height, 1, "adjacent blocks");
  assert.ok(thesis.includes(fmt(s.first_block.height)), "THESIS.md names the switch block");
  const a = hold.after_rebate_end;
  assert.ok(a && a.blocks > 0, "sampled blocks after the switch");
  assert.ok(thesis.includes(`${fmt(Math.round(a.burnt_per_year_near / 1000) * 1000)} NEAR`));
});

test("every data file the text relies on is hash-checked", () => {
  const sums = read("thesis/data/SHA256SUMS");
  for (const f of ["txshare_oct1_nov13.json", "protocol_config.json", "protocol_switch.json"]) assert.ok(sums.includes(`thesis/data/${f}`), f);
});

test("PREREG-2.md.ots is an OpenTimestamps proof of this exact PREREG-2.md, and a changed file fails", async () => {
  const { spawnSync } = await import("node:child_process");
  const { mkdtempSync, writeFileSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const run = (env) => spawnSync("node", [join(root, "thesis/check-anchor.mjs"), "--offline"], { env: { ...process.env, ...env }, encoding: "utf8" });
  const sha = createHash("sha256").update(read("thesis/PREREG-2.md")).digest("hex");
  const ok = run({});
  assert.equal(ok.status, 0, ok.stdout + ok.stderr);
  assert.ok(ok.stdout.includes(`OK   the proof is for sha256 ${sha}`));
  const changed = join(mkdtempSync(join(tmpdir(), "prereg-")), "PREREG-2.md");
  writeFileSync(changed, read("thesis/PREREG-2.md").replace("at least 11%", "at least 10%"));
  const bad = run({ PREREG_FILE: changed, OTS_FILE: join(root, "thesis/PREREG-2.md.ots") });
  assert.equal(bad.status, 1, "a changed PREREG-2.md must fail");
  assert.ok(bad.stdout.startsWith("FAIL"));
});

test("PREREG-2 scorer reads its rules from the stamped PREREG-2.md, and the frozen code still matches", async () => {
  const { STAMPED_SHA256, readPrereg } = await import("../score-prereg2.mjs");
  const text = read("thesis/PREREG-2.md");
  assert.equal(createHash("sha256").update(text).digest("hex"), STAMPED_SHA256, "PREREG-2.md is the file in the OpenTimestamps proof");
  const r = readPrereg(text);
  assert.deepEqual(r.window, { from: "2026-11-14T06:00:00Z", to: "2026-11-14T18:00:00Z" });
  assert.deepEqual(r.command, { from: r.window.from, to: r.window.to, blocks: 200, seed: 1114, out: "data/txshare_prereg2.json" });
  assert.equal(r.p1_min, 11);
  assert.equal(r.p2_min, 8);
  assert.equal(r.p3_target, "intents.near");
  assert.equal(r.rows.length, 3);
  assert.deepEqual(Object.keys(r.frozen).sort(), ["thesis/lib.mjs", "thesis/txshare.mjs"]);
  for (const [f, h] of Object.entries(r.frozen)) assert.equal(createHash("sha256").update(readFileSync(join(root, f))).digest("hex"), h, `${f} changed after PREREG-2.md froze it`);
});

test("PREREG-2 scorer applies the rules as written (dry run on the Oct 1 – Nov 12 sample reproduces the quoted baselines)", async () => {
  const { readPrereg, scorePrereg2, checkRun } = await import("../score-prereg2.mjs");
  const rules = readPrereg(read("thesis/PREREG-2.md"));
  const dry = scorePrereg2(tx, rules);
  assert.equal(dry.predictions[0].value.toFixed(1), "13.1");
  assert.equal(dry.predictions[1].value.toFixed(1), "10.2");
  assert.equal(dry.predictions[2].lead.txs, 134);
  assert.equal(tx.fc_txs, 200);
  assert.equal(dry.row, 1);
  assert.ok(checkRun(txFile, rules).length > 0, "the Oct 1 – Nov 12 file is not accepted as the PREREG-2 run");
  // Rule wiring on made-up summaries (test inputs only, not data):
  const s = (p1, p2, top) => ({ fc_tx_share: { point: p1 }, agent_tx_share: { point: p2 }, top_fc_receivers: top.map(([fc_receiver, txs]) => ({ fc_receiver, txs })) });
  const lead = [["intents.near", 9], ["x.near", 3]];
  assert.equal(scorePrereg2(s(11, 8, lead), rules).row, 1, "a bar is met at exactly the bar");
  assert.equal(scorePrereg2(s(12, 7.99, lead), rules).row, 2);
  assert.equal(scorePrereg2(s(12, 9, [["intents.near", 5], ["x.near", 5]]), rules).row, 2, "a tie for first fails P3");
  assert.equal(scorePrereg2(s(12, 9, [["x.near", 6], ["intents.near", 5]]), rules).row, 2);
  assert.equal(scorePrereg2(s(10.99, 9, lead), rules).row, 3, "P1 failing decides the row, whatever P2 and P3 do");
  assert.equal(scorePrereg2(s(12, 9, []), rules).predictions[2].holds, false, "no function-call transactions fails P3");
});

test("dashboard is rebuilt from the current data (run rebuild.mjs --offline if this fails)", async () => {
  const { execFileSync } = await import("node:child_process");
  const { mkdtempSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const out = join(mkdtempSync(join(tmpdir(), "thesis-")), "index.html");
  execFileSync("node", [join(root, "thesis/rebuild.mjs"), "--offline", "--out", out], { stdio: "ignore" });
  assert.equal(readFileSync(out, "utf8"), read("thesis/dashboard/index.html"));
});
