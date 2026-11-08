// Builds src/data/stations.json from the current NTES timetable crawled by railpull
// (github.com/shwetankg07/railpull, MIT). NTES is the only source. Run after `python transform/export.py`:
//   node scripts/stations-railpull.mjs <railpull>/data/out
//
// A station is listed only when a train that is not suburban/local (EMU, MEMU, DEMU, DMU, MMTS, suburban, toy,
// Namo Bharat) stops there in the current timetable. Passenger trains count. Everything else is dropped,
// including stations in no timetable. Codes in removed.tsv never come back. Existing display names are kept;
// new codes get the NTES name in title case. Only the derived list is kept in the repo, never the timetable.
import { readFile, writeFile } from "node:fs/promises";

const LOCAL = new Set(["SUB", "EMU", "MEMU", "DEMU", "DMU", "MMTS", "TOY", "VNDM"]);
const KEEP_UPPER = new Set(["JN", "CANT", "RS", "HLT", "PH", "MG", "SG", "GT", "KSR"]);
const title = (name) => name.trim().replace(/\.$/, "").replace(/\s+/g, " ").toLowerCase().split(" ")
  .map((w) => KEEP_UPPER.has(w.toUpperCase().replace(/\.$/, "")) ? w.toUpperCase() : w.replace(/(^|[-(.])([a-z])/g, (_, p, c) => p + c.toUpperCase())).join(" ");

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

const out = process.argv[2];
if (!out) { console.error("usage: node scripts/stations-railpull.mjs <railpull data/out>"); process.exit(1); }
const types = new Map(csv(await readFile(`${out}/trains.csv`, "utf8")).map((t) => [t.number, (t.type || "").toUpperCase()]));
const stops = csv(await readFile(`${out}/stops.csv`, "utf8"));
// A broken or partial crawl must not wipe the list.
const min = Number(process.env.RAILPULL_MIN_TRAINS ?? 3000);
if (types.size < min || stops.length < min * 15) { console.error(`Timetable looks incomplete (${types.size} trains, ${stops.length} stops); not applying.`); process.exit(1); }

const long = new Map();
for (const s of stops) {
  const code = s.station_code.trim().toUpperCase(); if (!/^[A-Z]{1,5}$/.test(code)) continue;
  if (!LOCAL.has(types.get(s.train_number) ?? "")) long.set(code, long.get(code) ?? s.station_name.trim());
}

const stations = new Map(JSON.parse(await readFile("src/data/stations.json", "utf8")));
const removed = new Set((await readFile("scripts/stations-official/removed.tsv", "utf8").catch(() => "")).split("\n").map((l) => l.split("\t")[0]).filter((c) => c && !c.startsWith("#")));
const next = new Map();
for (const [code, name] of long) if (!removed.has(code)) next.set(code, stations.get(code) ?? title(name));
if (next.size < stations.size * 0.7) { console.error(`Only ${next.size} stations vs ${stations.size} today; not applying.`); process.exit(1); }
const added = [...next].filter(([c]) => !stations.has(c)), dropped = [...stations].filter(([c]) => !next.has(c));
const rows = [...next].sort(([a], [b]) => a.localeCompare(b));
await writeFile("src/data/stations.json", JSON.stringify(rows) + "\n");

const line = `${types.size} trains, ${stops.length} stops: ${rows.length} stations, ${added.length} added, ${dropped.length} dropped`;
console.log(line);
if (process.env.STATIONS_SUMMARY) {
  const list = (r) => r.length ? r.slice(0, 80).map(([c, n]) => "`" + c + "` " + n).join(", ") + (r.length > 80 ? `, … (${r.length - 80} more)` : "") : "none";
  await writeFile(process.env.STATIONS_SUMMARY, [`**NTES timetable (railpull):** ${line}.`, "", `**Added:** ${list(added)}`, "", `**Dropped (no long-distance stop in the current timetable):** ${list(dropped)}`].join("\n") + "\n");
}
