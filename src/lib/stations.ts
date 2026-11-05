/** A station directory row: IRCTC station code and display name. */
export type Station = readonly [code: string, name: string];

/** Loads the bundled station directory on first use so it stays out of the initial bundle. */
let directory: Promise<readonly Station[]> | undefined;
export const loadStations = () => (directory ??= import("@/data/stations.json").then((m) => m.default as unknown as Station[]));

/**
 * Ranks stations for a query: recent stations first, then exact code, code prefix,
 * name word prefix and name substring matches. Free text stays valid; this only suggests.
 */
export function searchStations(stations: readonly Station[], query: string, recent: readonly string[] = [], limit = 12): Station[] {
  const q = query.trim().toUpperCase(), byCode = new Map(stations.map((s) => [s[0], s] as const));
  const recentRows = [...new Set(recent.map((r) => r.trim().toUpperCase()))].map((code) => byCode.get(code) ?? ([code, ""] as const)).filter(([code]) => code);
  const score = ([code, name]: Station) => {
    const upper = name.toUpperCase();
    if (code === q) return 0;
    if (code.startsWith(q)) return 1;
    if (upper.startsWith(q)) return 2;
    if (upper.split(/[\s-]+/).some((w) => w.startsWith(q))) return 3;
    return upper.includes(q) ? 4 : -1;
  };
  if (!q) return recentRows.slice(0, limit);
  const seen = new Set<string>(), out: Station[] = [];
  for (const row of recentRows.filter((r) => score(r) >= 0)) { seen.add(row[0]); out.push(row); }
  const matches = stations.filter((s) => !seen.has(s[0])).map((s) => [score(s), s] as const).filter(([sc]) => sc >= 0).sort((a, b) => a[0] - b[0] || a[1][0].length - b[1][0].length || a[1][0].localeCompare(b[1][0]));
  for (const [, s] of matches) { if (out.length >= limit) break; out.push(s); }
  return out.slice(0, limit);
}
