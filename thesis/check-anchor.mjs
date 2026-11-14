// check-anchor.mjs: was PREREG-2.md fixed before its window opened? Free, no account, no key,
// no npm install (Node 18+).
//   node thesis/check-anchor.mjs             full check, down to a Bitcoin block header (network)
//   node thesis/check-anchor.mjs --offline   only check that the proof is for this exact file
//
// PREREG-2.md was timestamped with OpenTimestamps (https://opentimestamps.org/) on 2026-11-13 at
// 17:17:45 UTC: its sha256 went to four public calendar servers, which commit it into a Bitcoin
// transaction. The proof, PREREG-2.md.ots, is a list of hash operations that turns the file's
// sha256 into the merkle root of a Bitcoin block. This script:
//   1. hashes PREREG-2.md and checks that the proof starts from that hash;
//   2. replays every operation in the proof. If the file has no Bitcoin attestation yet, it asks
//      each pending calendar for the rest of the path (GET <calendar>/timestamp/<commitment>);
//   3. downloads the claimed block header from two public explorers and checks that they agree,
//      that the header hashes to the block's hash, and that it meets its own proof-of-work target.
//      Then it checks that the replayed result equals the merkle root inside the header;
//   4. passes only if that block's time is at least 2 hours before the window opens. Miners set
//      block times, and they are only loosely tied to the clock
//      (https://en.bitcoin.it/wiki/Block_timestamp), hence the margin.
// To trust no explorer, run `ots verify thesis/PREREG-2.md.ots` against your own Bitcoin node, or
// drop both files on https://opentimestamps.org/. (Why Bitcoin and not NEAR: OpenTimestamps is
// free, while a SocialDB write on NEAR mainnet needs a funded account.)
// Exit code: 0 pass, 1 fail, 2 still pending (no Bitcoin block yet; try again later).
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const file = process.env.PREREG_FILE ?? join(dirname(fileURLToPath(import.meta.url)), "PREREG-2.md");
const proofFile = process.env.OTS_FILE ?? `${file}.ots`;
const EXPLORERS = (process.env.BTC_EXPLORERS ?? "https://mempool.space/api,https://blockstream.info/api").split(",");
const OFFLINE = process.argv.includes("--offline");
const text = readFileSync(file, "utf8");
const sha = createHash("sha256").update(text).digest("hex");
const opens = text.match(/Window opens:\*\*\s*`?([0-9T:\-]+Z)`?/)?.[1];
const fail = (msg) => { console.log(`FAIL ${msg}`); process.exit(1); };
const sleep = (t) => new Promise((s) => setTimeout(s, t));
const hash = (alg) => (m) => createHash(alg).update(m).digest();
const dsha = (m) => hash("sha256")(hash("sha256")(m));

// --- OpenTimestamps proof format (as written by the reference client, opentimestamps 0.5) ---
const MAGIC = Buffer.concat([Buffer.from([0]), Buffer.from("OpenTimestamps"), Buffer.from([0, 0]), Buffer.from("Proof"), Buffer.from([0]), Buffer.from("bf89e2e884e89294", "hex")]);
const BITCOIN = "0588960d73d71901", PENDING = "83dfe30d2ef90c8e"; // attestation tags
const UNARY = { 0x08: hash("sha256"), 0x02: hash("sha1"), 0x03: hash("ripemd160"), 0xf2: (m) => Buffer.from(m).reverse(), 0xf3: (m) => Buffer.from(m.toString("hex")) };
const BINARY = { 0xf0: (m, a) => Buffer.concat([m, a]), 0xf1: (m, a) => Buffer.concat([a, m]) }; // append, prepend
class Reader {
  constructor(b) { this.b = b; this.i = 0; }
  byte() { if (this.i >= this.b.length) throw new Error("proof is truncated"); return this.b[this.i++]; }
  bytes(n) { if (this.i + n > this.b.length) throw new Error("proof is truncated"); return this.b.subarray((this.i += n) - n, this.i); }
  uint() { let v = 0, s = 0, c; do { c = this.byte(); v += (c & 0x7f) * 2 ** s; s += 7; } while (c & 0x80); return v; }
  varbytes() { return this.bytes(this.uint()); }
}
// Replay a timestamp tree from msg; collect every attestation with the message it attests.
function walk(r, msg, out, depth = 0) {
  if (depth > 256) throw new Error("proof is too deep");
  const entry = (tag) => {
    if (tag === 0x00) {
      const kind = Buffer.from(r.bytes(8)).toString("hex"), p = new Reader(r.varbytes());
      out.push(kind === BITCOIN ? { kind: "bitcoin", height: p.uint(), msg } : kind === PENDING ? { kind: "pending", uri: p.varbytes().toString(), msg } : { kind: `other:${kind}`, msg });
      return;
    }
    const next = BINARY[tag] ? BINARY[tag](msg, r.varbytes()) : UNARY[tag] ? UNARY[tag](msg) : null;
    if (!next) throw new Error(`unknown operation 0x${tag.toString(16)} in proof`);
    walk(r, next, out, depth + 1);
  };
  let tag = r.byte();
  while (tag === 0xff) { entry(r.byte()); tag = r.byte(); } // 0xff: another branch follows
  entry(tag);
}

async function get(url, binary) {
  for (let i = 0; i < 4; i++) {
    try {
      const r = await fetch(url, { headers: { accept: binary ? "application/vnd.opentimestamps.v1" : "text/plain" }, signal: AbortSignal.timeout(20000) });
      if (r.status === 404) return null;
      if (r.ok) return binary ? Buffer.from(await r.arrayBuffer()) : (await r.text()).trim();
    } catch { /* retried below */ }
    await sleep(1500 * (i + 1));
  }
  throw new Error(`no answer from ${url}`);
}
// A Bitcoin block header that two explorers agree on, whose hash meets its own proof-of-work target.
async function header(height) {
  const seen = [];
  for (const api of EXPLORERS) {
    const id = await get(`${api}/block-height/${height}`);
    if (!id) throw new Error(`${api} has no block ${height}`);
    seen.push({ api, id, hex: await get(`${api}/block/${id}/header`) });
  }
  if (new Set(seen.map((s) => `${s.id}${s.hex}`)).size !== 1) throw new Error(`explorers disagree about block ${height}`);
  const h = Buffer.from(seen[0].hex, "hex");
  if (h.length !== 80) throw new Error(`block ${height}: header is ${h.length} bytes, not 80`);
  const id = Buffer.from(dsha(h)).reverse().toString("hex");
  if (id !== seen[0].id) throw new Error(`block ${height}: header does not hash to ${seen[0].id}`);
  const bits = h.readUInt32LE(72), target = BigInt(bits & 0x7fffff) << BigInt(8 * ((bits >>> 24) - 3));
  if (BigInt(`0x${id}`) > target) throw new Error(`block ${height}: hash is above its proof-of-work target`);
  if (target >= 1n << 192n) throw new Error(`block ${height}: proof-of-work target is too easy for Bitcoin mainnet`);
  return { height, id, merkle: Buffer.from(h.subarray(36, 68)), time: h.readUInt32LE(68), via: seen.map((s) => new URL(s.api).host) };
}

// 1. the proof is for this exact file
const r = new Reader(readFileSync(proofFile));
if (!Buffer.from(r.bytes(MAGIC.length)).equals(MAGIC)) fail(`${proofFile} is not an OpenTimestamps proof`);
if (r.uint() !== 1) fail("unknown OpenTimestamps proof version");
if (r.byte() !== 0x08) fail("the proof does not hash the file with sha256");
const digest = Buffer.from(r.bytes(32));
const leaves = [];
walk(r, digest, leaves);
if (r.i !== r.b.length) fail("unexpected bytes after the proof");
if (digest.toString("hex") !== sha) fail(`the proof is for sha256 ${digest.toString("hex")}, but PREREG-2.md hashes to ${sha}`);
console.log(`OK   the proof is for sha256 ${sha} (PREREG-2.md)`);
const pending = leaves.filter((l) => l.kind === "pending"), btc = leaves.filter((l) => l.kind === "bitcoin");
console.log(`     in the file: ${btc.length} Bitcoin attestation(s), ${pending.length} pending at ${pending.map((p) => new URL(p.uri).host).join(", ")}`);
if (OFFLINE) process.exit(0);

// 2. complete pending branches from their calendars, only if the file has no Bitcoin attestation
//    yet (a complete proof is checked without contacting any calendar)
for (const p of btc.length ? [] : pending) {
  if (!/^https:\/\/[a-z0-9.-]+$/i.test(p.uri)) { console.log(`     skipped calendar ${p.uri} (not a plain https host)`); continue; }
  const body = await get(`${p.uri}/timestamp/${p.msg.toString("hex")}`, true).catch(() => undefined);
  if (body === undefined) { console.log(`     ${new URL(p.uri).host}: no answer`); continue; }
  if (body === null) { console.log(`     ${new URL(p.uri).host}: not in a Bitcoin block yet`); continue; }
  const more = [];
  walk(new Reader(body), p.msg, more);
  for (const b of more.filter((l) => l.kind === "bitcoin")) btc.push({ ...b, calendar: new URL(p.uri).host });
}
if (!btc.length) {
  console.log(`PENDING no Bitcoin block yet (window opens ${opens}). Calendars usually get one within a few hours; run again later.`);
  process.exit(2);
}

// 3 and 4. each claimed block: merkle root and time
let best = null;
for (const b of btc) {
  const h = await header(b.height);
  const ok = b.msg.equals(h.merkle);
  console.log(`${ok ? "OK  " : "FAIL"} Bitcoin block ${h.height} (${h.id}): merkle root ${ok ? "equals" : "differs from"} the proof's result${b.calendar ? `, path from ${b.calendar}` : ""}; header from ${h.via.join(" and ")}`);
  if (ok && (!best || h.time < best.time)) best = h;
}
if (!best) fail("no Bitcoin attestation in the proof matches its block");
const margin = (Date.parse(opens) - best.time * 1000) / 3600000;
const okTime = Number.isFinite(margin) && margin >= 2;
console.log(`${okTime ? "OK  " : "FAIL"} block ${best.height} time ${new Date(best.time * 1000).toISOString()}, ${margin.toFixed(1)} h before the window opened (${opens}); the check needs at least 2 h`);
process.exit(okTime ? 0 : 1);
