// Applies a current NTES timetable crawled by railpull (github.com/shwetankg07/railpull, MIT) to the
// long-distance station filter. Run after `python transform/export.py`:
//   node scripts/stations-railpull.mjs <railpull>/data/out
//
// A station is long-distance when any train that is not suburban/local (EMU, MEMU, DEMU, DMU, MMTS, suburban,
// toy, Namo Bharat) stops there. Passenger trains count. Then:
// - long-distance stops: marked "timetable YYYY-MM" in long-distance.tsv (and taken out of dropped.tsv);
// - stations only local trains stop at: moved to dropped.tsv;
// - stations in no timetable at all: left alone (new stations without a timetable are kept);
// - long-distance stops missing from the list: written to timetable.tsv, which the build adds.
// Only the derived station codes are kept in the repo, never the crawled timetable.
import { readFile, writeFile } from "node:fs/promises";

const DIR = "scripts/stations-official";
const LOCAL = new Set(["SUB", "EMU", "MEMU", "DEMU", "DMU", "MMTS", "TOY", "VNDM"]);
const month = new Date().toISOString().slice(0, 7);

/** Minimal CSV reader (quoted fields, doubled quotes). */
function csv(text) {
  const rows = []; let row = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) { if (c === '"' && text[i + 1] === '"') { field += '"'; i++; } else if (c === '"') quoted = false; else field += c; }
    else if (c === '"') quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field.replace(/\r$/, "")); rows.push(row); row = []; field = ""; }
    else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const [head, ...body] = rows;
  return body.filter((r) => r.length > 1).map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ""])));
}
const tsv = async (f) => (await readFile(`${DIR}/${f}`, "utf8").catch(() => "")).split("\n").filter(Boolean);

const out = process.argv[2];
if (!out) { console.error("usage: node scripts/stations-railpull.mjs <railpull data/out>"); process.exit(1); }
const types = new Map(csv(await readFile(`${out}/trains.csv`, "utf8")).map((t) => [t.number, (t.type || "").toUpperCase()]));
const stops = csv(await readFile(`${out}/stops.csv`, "utf8"));
const min = Number(process.env.RAILPULL_MIN_TRAINS ?? 3000);
if (types.size < min || stops.length < min * 15) { console.error(`Timetable looks incomplete (${types.size} trains, ${stops.length} stops); not applying.`); process.exit(1); }

const long = new Map(), seen = new Set();
for (const s of stops) {
  const code = s.station_code.trim().toUpperCase(); if (!/^[A-Z]{1,5}$/.test(code)) continue;
  seen.add(code);
  if (!LOCAL.has(types.get(s.train_number) ?? "")) long.set(code, long.get(code) ?? s.station_name.trim());
}

const stations = new Map(JSON.parse(await readFile("src/data/stations.json", "utf8")));
const removed = new Set((await tsv("removed.tsv")).map((l) => l.split("\t")[0]));
const ldLines = await tsv("long-distance.tsv"), dropLines = await tsv("dropped.tsv");
const header = (lines, fallback) => lines.find((l) => l.startsWith("#")) ?? fallback;
const ld = new Map(ldLines.filter((l) => !l.startsWith("#")).map((l) => { const [c, n, b] = l.split("\t"); return [c, [n, b]]; }));
const dropped = new Map(dropLines.filter((l) => !l.startsWith("#")).map((l) => { const [c, n, r] = l.split("\t"); return [c, [n, r]]; }));

let confirmed = 0, nowLocal = 0, restored = 0;
const added = [];
for (const [code, name] of long) {
  if (removed.has(code)) continue;
  if (dropped.delete(code)) restored++;
  ld.set(code, [stations.get(code) ?? ld.get(code)?.[0] ?? name, `timetable ${month}`]); confirmed++;
  if (!stations.has(code)) added.push([code, name]);
}
for (const code of seen) {
  if (long.has(code) || dropped.has(code)) continue;
  const name = stations.get(code) ?? ld.get(code)?.[0]; if (!name) continue;
  ld.delete(code); dropped.set(code, [name, `local (timetable ${month})`]); nowLocal++;
}

const write = (f, head, map) => writeFile(`${DIR}/${f}`, [head, ...[...map].sort(([a], [b]) => a.localeCompare(b)).map(([c, v]) => [c, ...v].join("\t"))].join("\n") + "\n");
await write("long-distance.tsv", "# code\tname\tbasis (timetable = long-distance/Passenger stop in the NTES timetable via railpull; schedule = datameet 2017; unverified = no timetable)", ld);
await write("dropped.tsv", header(dropLines, "# code\tname\treason"), dropped);
await writeFile(`${DIR}/timetable.tsv`, ["# code\tname (long-distance stops in the current timetable that are missing from the list; added by the build)", ...added.sort().map((r) => r.join("\t"))].join("\n") + "\n");

const line = `${types.size} trains, ${stops.length} stops: ${confirmed} long-distance stations confirmed, ${nowLocal} now local-only (dropped), ${restored} back from dropped, ${added.length} new codes`;
console.log(line);
if (process.env.STATIONS_SUMMARY) await writeFile(process.env.STATIONS_SUMMARY + ".timetable", `**NTES timetable (railpull):** ${line}.\n`);
