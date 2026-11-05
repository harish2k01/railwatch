// Builds src/data/stations.json ([code, name] pairs) from the CC0 datameet/railways station list.
// Run: node scripts/generate-stations.mjs path/to/stations.json   (https://github.com/datameet/railways)
import { readFile, writeFile } from "node:fs/promises";

const KEEP_UPPER = new Set(["JN", "CANT", "RS", "HLT", "PH", "MG", "SG", "GT", "KSR"]);
const title = (name) => name.trim().replace(/\s+/g, " ").toLowerCase().split(" ")
  .map((w) => KEEP_UPPER.has(w.toUpperCase()) ? w.toUpperCase() : w.replace(/(^|[-(.])([a-z])/g, (_, p, c) => p + c.toUpperCase())).join(" ");

const source = JSON.parse(await readFile(process.argv[2], "utf8"));
const byCode = new Map();
for (const { properties: p } of source.features) {
  const code = String(p.code ?? "").trim().toUpperCase();
  if (/^[A-Z]{1,5}$/.test(code) && p.name && !byCode.has(code)) byCode.set(code, title(String(p.name)));
}
const rows = [...byCode].sort(([a], [b]) => a.localeCompare(b));
await writeFile("src/data/stations.json", JSON.stringify(rows) + "\n");
console.log(`${rows.length} stations`);
