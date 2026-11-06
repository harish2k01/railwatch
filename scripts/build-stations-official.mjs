// Applies official Indian Railways zonal station lists to src/data/stations.json ([code, name] pairs).
//
// 1) Extract a zonal PDF into scripts/stations-official/<zone>.tsv (code<TAB>official name, name may be empty):
//      node scripts/build-stations-official.mjs extract <zone> <file.pdf>
// 2) Rebuild the list. Official names win; no station is dropped. Codes found in neither an official list
//    nor Wikidata (P5696) are written to scripts/stations-official/possibly-retired.tsv for review:
//      node scripts/build-stations-official.mjs build [saved-wikidata-sparql-results.json]
import { readFile, writeFile, readdir } from "node:fs/promises";

const DIR = "scripts/stations-official";
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
  for (const f of (await readdir(DIR)).filter((f) => f.endsWith(".tsv") && f !== "possibly-retired.tsv").sort()) {
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
  const rows = [...stations].sort(([a], [b]) => a.localeCompare(b));
  await writeFile("src/data/stations.json", JSON.stringify(rows) + "\n");
  const retired = rows.filter(([c]) => !official.has(c) && !wikidata.has(c));
  await writeFile(`${DIR}/possibly-retired.tsv`, retired.map((r) => r.join("\t")).join("\n") + "\n");
  console.log(`${rows.length} stations, ${renamed} official renames, ${retired.length} possibly retired`);
}

const [cmd, a, b] = process.argv.slice(2);
if (cmd === "extract") await extract(a, b);
else if (cmd === "build") await build(a);
else console.error("usage: extract <zone> <file.pdf> | build [wikidata.json]");
