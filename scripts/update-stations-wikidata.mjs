// Refreshes src/data/stations.json from Wikidata (CC0), keeping datameet stations Wikidata lacks.
// Run: node scripts/update-stations-wikidata.mjs        (queries https://query.wikidata.org, property P5696)
//  or: node scripts/update-stations-wikidata.mjs path/to/saved-sparql-results.json
import { readFile, writeFile } from "node:fs/promises";

const QUERY = 'SELECT ?code ?label WHERE { ?s wdt:P5696 ?code . ?s rdfs:label ?label . FILTER(LANG(?label)="en") }';
const results = process.argv[2]
  ? JSON.parse(await readFile(process.argv[2], "utf8"))
  : await (await fetch("https://query.wikidata.org/sparql?query=" + encodeURIComponent(QUERY), { headers: { Accept: "application/sparql-results+json", "User-Agent": "RailWatch-station-list/1.0" } })).json();

/** "Madurai Junction railway station" -> "Madurai JN"; keeps the name people see on tickets and boards. */
const clean = (label) => label.replace(/\s+railway station$/i, "").replace(/\s+(railway|train)\s+halt$/i, " Halt").replace(/\bJunction\b/g, "JN").replace(/\bCantonment\b/g, "Cant").replace(/\s+/g, " ").trim();

const existing = new Map(JSON.parse(await readFile("src/data/stations.json", "utf8")));
const fromWikidata = new Map();
for (const row of results.results.bindings) {
  const code = String(row.code.value).trim().toUpperCase();
  if (/^[A-Z]{1,5}$/.test(code) && !fromWikidata.has(code)) fromWikidata.set(code, clean(row.label.value));
}
const merged = new Map([...existing, ...fromWikidata]);
const rows = [...merged].sort(([a], [b]) => a.localeCompare(b));
await writeFile("src/data/stations.json", JSON.stringify(rows) + "\n");
const added = [...fromWikidata.keys()].filter((c) => !existing.has(c)).length;
console.log(`${rows.length} stations (${added} new from Wikidata, ${fromWikidata.size} names refreshed)`);
