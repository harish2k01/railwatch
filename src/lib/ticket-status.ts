/** Waitlist tracking: reads a status like "WL 12", "RAC 3", "CNF" or "GNWL/24" from text or an IRCTC PNR SMS. */
export function parseBookingStatus(text: string): { ticketStatus: "CNF" | "RAC" | "WL"; currentStatus: string } | undefined {
  const t = text.toUpperCase();
  // In a PNR SMS the current status is the last one listed per passenger (e.g. "WL 12 WL 4" or "GNWL24/WL4").
  const all = [...t.matchAll(/\b(CNF|CONFIRMED|RAC\s*\/?\s*\d+|(?:RL|PQ|GN|TQ|RS)?WL\s*\/?\s*\d+)\b/g)].map(m => m[1].replace(/\s*\/?\s*/g, ""));
  const last = all.pop();
  if (!last) return /\b(CNF|CONFIRMED)\b/.test(t) ? { ticketStatus: "CNF", currentStatus: "CNF" } : undefined;
  if (last === "CNF" || last === "CONFIRMED") return { ticketStatus: "CNF", currentStatus: "CNF" };
  const rac = last.match(/^RAC(\d+)$/); if (rac) return { ticketStatus: "RAC", currentStatus: `RAC ${rac[1]}` };
  const wl = last.match(/WL(\d+)$/); if (wl) return { ticketStatus: "WL", currentStatus: `WL ${wl[1]}` };
  return undefined;
}
