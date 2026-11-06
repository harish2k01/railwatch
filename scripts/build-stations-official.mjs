// Applies official Indian Railways zonal station lists to src/data/stations.json ([code, name] pairs).
//
// 1) Extract a zonal PDF into scripts/stations-official/<zone>.tsv (code<TAB>official name, name may be empty):
//      node scripts/build-stations-official.mjs extract <zone> <file.pdf>
// 2) Rebuild the list. Official names win; no station is dropped. Codes found in neither an official list
//    nor Wikidata (P5696) are written to scripts/stations-official/possibly-retired.tsv for review:
//      node scripts/build-stations-official.mjs build [saved-wikidata-sparql-results.json]
import { readFile, writeFile, readdir } from "node:fs/promises";

const DIR = "scripts/stations-official";
const NOT_ZONE = new Set(["possibly-retired.tsv", "removed.tsv", "long-distance.tsv", "dropped.tsv"]);
const KEEP_UPPER = new Set(["JN", "CANT", "RS", "HLT", "PH", "MG", "SG", "GT", "KSR"]);
const title = (name) => name.trim().replace(/\.$/, "").replace(/\s+/g, " ").toLowerCase().split(" ")
  .map((w) => KEEP_UPPER.has(w.toUpperCase()) ? w.toUpperCase() : w.replace(/(^|[-(.])([a-z])/g, (_, p, c) => p + c.toUpperCase())).join(" ");

const NAME = "([A-Za-z][A-Za-z .()'-]*?)";
const SEP = "\\s*\\|\\s+\\|\\s*";
/** Per-zone row patterns over the "a | | b" text pdfjs gives for each table row. */
const PATTERNS = {
  sr: new RegExp(`${NAME}${SEP}([A-Z]{1,5})${SEP}(?:Kerala|Tamil Nadu|Karnataka|Puducherry|Andhra Pradesh)`, "g"),
  er: new RegExp(`${NAME}${SEP}([A-Z]{1,5})${SEP}(?:ASN|HWH|MLDT|SDAH)\\b`, "g"),
  ncr: new RegExp(`${NAME}${SEP}([A-Z]{1,5})${SEP}(?:I|II|III)\\b`, "g"),
};

async function pdfText(file) {
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await getDocument({ data: new Uint8Array(await readFile(file)) }).promise;
  const out = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const lines = new Map();
    for (const it of (await (await doc.getPage(p)).getTextContent()).items) {
      const y = Math.round(it.transform[5]);
      if (!lines.has(y)) lines.set(y, []);
      lines.get(y).push([it.transform[4], it.str]);
    }
    for (const y of [...lines.keys()].sort((a, b) => b - a)) out.push(lines.get(y).sort((a, b) => a[0] - b[0]).map((x) => x[1]).join(" | "));
  }
  return out.join("\n");
}

async function extract(zone, file) {
  const text = await pdfText(file);
  const rows = new Map();
  if (PATTERNS[zone]) {
    for (const m of text.matchAll(PATTERNS[zone])) if (!rows.has(m[2])) rows.set(m[2], title(m[1]));
  } else {
    // Lists that only give codes, e.g. "NSG-3 ( SHC, BMKI, BTH ... )".
    for (const group of text.matchAll(/\(([A-Z ,|\n]+)\)/g)) for (const code of group[1].match(/\b[A-Z]{2,5}\b/g) ?? []) rows.set(code, "");
  }
  await writeFile(`${DIR}/${zone}.tsv`, [...rows].map((r) => r.join("\t")).join("\n") + "\n");
  console.log(`${zone}: ${rows.size} codes`);
}

async function build(wikidataFile) {
  const QUERY = "SELECT ?code WHERE { ?s wdt:P5696 ?code }";
  const results = wikidataFile
    ? JSON.parse(await readFile(wikidataFile, "utf8"))
    : await (await fetch("https://query.wikidata.org/sparql?query=" + encodeURIComponent(QUERY), { headers: { Accept: "application/sparql-results+json", "User-Agent": "RailWatch-station-list/1.0" } })).json();
  const wikidata = new Set(results.results.bindings.map((b) => String(b.code.value).trim().toUpperCase()));

  const stations = new Map(JSON.parse(await readFile("src/data/stations.json", "utf8")));
  const official = new Set();
  let renamed = 0;
  for (const f of (await readdir(DIR)).filter((f) => f.endsWith(".tsv") && !NOT_ZONE.has(f)).sort()) {
    let matched = 0;
    for (const line of (await readFile(`${DIR}/${f}`, "utf8")).split("\n").filter(Boolean)) {
      const [code, name] = line.split("\t");
      official.add(code);
      if (!stations.has(code)) { if (name) stations.set(code, name); continue; }
      matched++;
      // Keep a fuller existing name when the PDF abbreviates (e.g. "Jn" vs "JN", same words).
      // Some PDFs leave off "JN"/"Halt"/"Cant"; carry that suffix over from the existing name.
      const suffix = stations.get(code).match(/ (JN|Halt|Cant)$/)?.[0] ?? "";
      const full = name && suffix && !new RegExp(`${suffix}\\b`, "i").test(name) ? name.replace(/ \((Halt|Flag)\)$/, "") + suffix : name;
      if (full && full.toLowerCase().replace(/\W/g, "") !== stations.get(code).toLowerCase().replace(/\W/g, "")) { stations.set(code, full); renamed++; }
    }
    console.log(`${f}: ${matched} matched existing codes`);
  }
  // Confirmed retired/invalid codes (removed.tsv) never come back on a rebuild.
  for (const line of (await readFile(`${DIR}/removed.tsv`, "utf8").catch(() => "")).split("\n")) { const code = line.split("\t")[0]; if (code && !code.startsWith("#")) stations.delete(code); }
  // Long-distance filter (STATIONS_ALL=1 skips it): codes in dropped.tsv (local-only/metro) are removed; codes in
  // neither long-distance.tsv nor dropped.tsv are new since the 2017 schedules, so they are kept and appended to
  // long-distance.tsv as "unverified-new" for review in the refresh PR instead of being silently dropped or added.
  const tsvCodes = async (f) => new Set((await readFile(`${DIR}/${f}`, "utf8").catch(() => "")).split("\n").map((l) => l.split("\t")[0]).filter((c) => c && !c.startsWith("#")));
  const keep = await tsvCodes("long-distance.tsv"), dropped = await tsvCodes("dropped.tsv");
  const added = [];
  if (!process.env.STATIONS_ALL && keep.size) {
    for (const [code, name] of stations) {
      if (dropped.has(code)) stations.delete(code);
      else if (!keep.has(code)) added.push([code, name, `unverified-new ${new Date().toISOString().slice(0, 10)}`]);
    }
    if (added.length) await writeFile(`${DIR}/long-distance.tsv`, (await readFile(`${DIR}/long-distance.tsv`, "utf8")) + added.map((r) => r.join("\t")).join("\n") + "\n");
  }
  const rows = [...stations].sort(([a], [b]) => a.localeCompare(b));
  await writeFile("src/data/stations.json", JSON.stringify(rows) + "\n");
  const retired = rows.filter(([c]) => !official.has(c) && !wikidata.has(c));
  await writeFile(`${DIR}/possibly-retired.tsv`, retired.map((r) => r.join("\t")).join("\n") + "\n");
  const unverified = (await readFile(`${DIR}/long-distance.tsv`, "utf8").catch(() => "")).split("\n").filter((l) => /\tunverified/.test(l) && stations.has(l.split("\t")[0])).length;
  console.log(`${rows.length} stations, ${renamed} official renames, ${retired.length} possibly retired, ${added.length} new unverified`);
  // Markdown summary for the monthly refresh PR body (path from STATIONS_SUMMARY).
  if (process.env.STATIONS_SUMMARY) {
    const list = (r) => r.length ? r.slice(0, 50).map(([c, n]) => `\`${c}\` ${n}`).join(", ") + (r.length > 50 ? `, … (${r.length - 50} more)` : "") : "none";
    await writeFile(process.env.STATIONS_SUMMARY, [
      `| | Count |`, `| --- | --- |`, `| Stations | ${rows.length} |`, `| Unverified (no 2017 schedule, kept for review) | ${unverified} |`,
      `| New since last refresh (added as unverified-new) | ${added.length} |`, `| Possibly retired (no official list or Wikidata) | ${retired.length} |`,
      `| Held out: local-only/metro (dropped.tsv) | ${dropped.size} |`, ``,
      `**New unverified codes:** ${list(added)}`, ``, `**Possibly retired:** ${list(retired)}`,
    ].join("\n") + "\n");
  }
}

/**
 * Writes long-distance.tsv (code, name, basis) from datameet/railways trains.json + schedules.json (CC0, ~2017).
 * Kept: any station where a Passenger or Mail/Express-class train stops (arrival differs from departure, or it
 * starts/ends there): Pass, SF, Exp, Mail, Raj, Shtb, JShtb, GR, SKr, Drnt.
 * Dropped (written to dropped.tsv so rebuilds never re-add them): stations served only by EMU/MEMU/DEMU, suburban
 * (Hyd MMTS, Klkt, Del) or toy trains, and stations with no 2017 schedule whose name says Metro. Stations with no
 * 2017 schedule at all (newer than the data) are kept as "unverified". Hand edits: move rows between the two files.
 */
async function longDistance(trainsFile, schedulesFile) {
  const LONG = new Set(["Pass", "SF", "Exp", "Mail", "Raj", "Shtb", "JShtb", "GR", "SKr", "Drnt"]);
  const type = new Map(JSON.parse(await readFile(trainsFile, "utf8")).features.map((f) => [f.properties.number, f.properties.type]));
  const served = new Set(), long = new Set();
  for (const r of JSON.parse(await readFile(schedulesFile, "utf8"))) {
    served.add(r.station_code);
    // schedules.json also lists stations a train runs through: equal arrival/departure means no stop.
    const stops = (r.arrival === "None") !== (r.departure === "None") || (r.arrival !== "None" && r.arrival !== r.departure);
    if (stops && LONG.has(type.get(r.train_number))) long.add(r.station_code);
  }
  const stations = JSON.parse(await readFile("src/data/stations.json", "utf8"));
  const out = [], dropped = [], counts = { schedule: 0, unverified: 0, local: 0, metro: 0 };
  for (const [code, name] of stations) {
    const basis = long.has(code) ? "schedule" : served.has(code) ? "local" : /metro/i.test(name) ? "metro" : "unverified";
    counts[basis]++;
    (basis === "schedule" || basis === "unverified" ? out : dropped).push([code, name, basis]);
  }
  await writeFile(`${DIR}/long-distance.tsv`, "# code\tname\tbasis (schedule = Passenger/Mail/Express stop in datameet 2017; unverified = no 2017 schedule)\n" + out.map((r) => r.join("\t")).join("\n") + "\n");
  await writeFile(`${DIR}/dropped.tsv`, "# code\tname\treason (local = only EMU/MEMU/DEMU/suburban/toy trains stop; metro)\n" + dropped.map((r) => r.join("\t")).join("\n") + "\n");
  console.log(counts);
}

/**
 * Cross-checks long-distance.tsv / dropped.tsv against Trains at a Glance (TAG), the Railway Board's official
 * Mail/Express timetable (https://rb.indianrailways.gov.in/show-directorate/view/228, TAG-2026 table PDFs).
 * TAG names only principal stops and gives no codes, so matching is by name, and only where exactly one of our
 * stations has that name. Matched "unverified" rows become "tag2026"; matched dropped rows move back as "tag2026".
 *   node scripts/build-stations-official.mjs tag <TAG pdf>...
 */
async function tag(files) {
  const norm = (s) => s.toLowerCase().replace(/\(t\)|\bterminus\b/g, " terminus ").replace(/\(.*?\)/g, "").replace(/\b(jn|junction|halt|cantt?)\b\.?/g, "").replace(/[^a-z]/g, "");
  const names = new Set();
  // Station rows read "| <km> |   | <Station name> |".
  for (const f of files) for (const m of (await pdfText(f)).matchAll(/\|\s*\d{1,4}\s*\|\s+\|\s*([A-Z][A-Za-z .()'-]{2,}?)\s*\|/g)) names.add(norm(m[1]));
  const read = async (f) => (await readFile(`${DIR}/${f}`, "utf8")).split("\n").filter(Boolean);
  const [ldHead, ...ld] = await read("long-distance.tsv"), [drHead, ...dr] = await read("dropped.tsv");
  const all = [...ld, ...dr].map((l) => l.split("\t"));
  const seen = new Map();
  for (const [, name] of all) seen.set(norm(name), (seen.get(norm(name)) ?? 0) + 1);
  const hit = (name) => names.has(norm(name)) && seen.get(norm(name)) === 1;
  let verified = 0, rescued = 0;
  const keepRows = ld.map((l) => { const r = l.split("\t"); if (r[2] === "unverified" && hit(r[1])) { r[2] = "tag2026"; verified++; } return r.join("\t"); });
  const dropRows = [];
  for (const l of dr) { const r = l.split("\t"); if (hit(r[1])) { keepRows.push([r[0], r[1], "tag2026"].join("\t")); rescued++; } else dropRows.push(l); }
  await writeFile(`${DIR}/long-distance.tsv`, [ldHead, ...keepRows.sort()].join("\n") + "\n");
  await writeFile(`${DIR}/dropped.tsv`, [drHead, ...dropRows].join("\n") + "\n");
  console.log(`TAG station names: ${names.size}; unverified confirmed: ${verified}; rescued from dropped: ${rescued}`);
}

const [cmd, a, b] = process.argv.slice(2);
if (cmd === "tag") await tag(process.argv.slice(3));
else if (cmd === "long-distance") await longDistance(a, b);
else if (cmd === "extract") await extract(a, b);
else if (cmd === "build") await build(a);
else console.error("usage: extract <zone> <file.pdf> | long-distance <trains.json> <schedules.json> | build [wikidata.json]");
