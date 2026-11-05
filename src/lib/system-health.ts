import { prisma } from "./db";

type Latest = { tag: string; url: string } | null;
let cached: { at: number; value: Latest } | undefined;

/** Latest published RailWatch release from GitHub, cached for an hour; null when unreachable. */
async function latestRelease(now: number): Promise<Latest> {
  if (cached && now - cached.at < 3600000) return cached.value;
  let value: Latest = null;
  try {
    const response = await fetch("https://api.github.com/repos/harish2k01/railwatch/releases/latest", { headers: { Accept: "application/vnd.github+json", "User-Agent": "railwatch-health" }, redirect: "error", signal: AbortSignal.timeout(5000) });
    if (response.ok) { const data = await response.json() as { tag_name?: unknown; html_url?: unknown }; if (typeof data.tag_name === "string" && typeof data.html_url === "string") value = { tag: data.tag_name, url: data.html_url }; }
  } catch { /* offline or rate-limited: report unknown */ }
  cached = { at: now, value };
  return value;
}

/** Version, update availability and 24-hour delivery outcomes per channel for System health (plan 3.9). */
export async function systemHealth(now = new Date()) {
  const version = process.env.NEXT_PUBLIC_APP_VERSION ?? "development";
  const since = new Date(now.getTime() - 86400000);
  const [latest, outcomes, db, files, members] = await Promise.all([
    latestRelease(now.getTime()),
    prisma.railJob.groupBy({ by: ["kind", "state"], where: { kind: { in: ["EMAIL", "PUSH", "TELEGRAM"] }, state: { in: ["SENT", "FAILED", "MISSED"] }, updatedAt: { gte: since } }, _count: true }),
    prisma.$queryRaw<{ bytes: bigint }[]>`SELECT pg_database_size(current_database()) AS bytes`,
    prisma.railFile.aggregate({ _sum: { size: true }, _count: true }),
    prisma.user.count({ where: { isActive: true } }),
  ]);
  const channels: Record<string, { sent: number; failed: number; failureRate: number | null }> = {};
  for (const row of outcomes) {
    const c = channels[row.kind] ??= { sent: 0, failed: 0, failureRate: null };
    if (row.state === "SENT") c.sent += row._count; else c.failed += row._count;
  }
  for (const c of Object.values(channels)) c.failureRate = c.sent + c.failed ? Math.round((c.failed / (c.sent + c.failed)) * 100) : null;
  const updateAvailable = Boolean(latest && /^v\d+\.\d+\.\d+$/.test(version) && latest.tag !== version);
  // Storage (canvas Admin: Database, Ticket files, Members).
  const storage = { databaseBytes: Number(db[0]?.bytes ?? 0), ticketBytes: files._sum.size ?? 0, ticketFiles: files._count, members };
  return { version, latest, updateAvailable, channels, storage };
}
