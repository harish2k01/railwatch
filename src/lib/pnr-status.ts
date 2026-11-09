import { z } from "zod";
import type { Journey } from "./travel-planner";

export const pnrSnapshotSchema = z.object({
  pnr: z.string().regex(/^\d{10}$/), checkedAt: z.string().datetime(),
  chartStatus: z.string().max(100),
  passengers: z.array(z.object({ number: z.number().int().min(1).max(100), booking: z.string().max(100), current: z.string().max(100), coach: z.string().max(20), berth: z.string().max(30) })).min(1).max(100),
});
export type PnrSnapshot = z.infer<typeof pnrSnapshotSchema>;
const text = (v: unknown, max = 100) => typeof v === "string" || typeof v === "number" ? String(v).trim().slice(0, max) : "";
const record = (v: unknown): Record<string, unknown> => v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {};

/** Validates provider output before it can replace the last successful snapshot. Fare is intentionally excluded. */
export function parsePnrStatus(value: unknown, pnr: string, now = new Date()): PnrSnapshot {
  const data = record(value);
  if (data.errorMessage || String(data.PNR ?? "") !== pnr) throw new Error("PNR_LOOKUP_FAILED");
  const passengers = Array.isArray(data.passengers) ? data.passengers : [];
  const info = Array.isArray(data.other_info) ? Object.assign({}, ...data.other_info.map(record)) : record(data.other_info);
  return pnrSnapshotSchema.parse({ pnr, checkedAt: now.toISOString(), chartStatus: text(info.chartStatus ?? data.chartStatus), passengers: passengers.map((raw, index) => {
    const p = record(raw);
    const current = text(p.currentStatus ?? p.currentStatusDetails);
    if (!current) throw new Error("PNR_LOOKUP_FAILED");
    return { number: Number(p.passengerSerialNumber ?? index + 1), booking: text(p.bookingStatus ?? p.bookingStatusDetails), current, coach: text(p.currentCoachId ?? p.coach, 20), berth: text(p.currentBerthNo ?? p.berth, 30) };
  }) });
}

/** Reduces passenger statuses conservatively: a mixed PNR must never appear fully confirmed. */
export function pnrSummary(snapshot: PnrSnapshot): "CNF" | "RAC" | "WL" | "CANCELLED" | undefined {
  const values = snapshot.passengers.map(p => p.current.toUpperCase());
  if (values.length && values.every(s => /^(CAN|CANCELLED|CANCELED)$/.test(s.trim()))) return "CANCELLED";
  if (values.some(s => /WL|WAIT/.test(s))) return "WL";
  if (values.some(s => /RAC/.test(s))) return "RAC";
  if (values.every(s => /^(CNF|CONFIRMED)(\b|[-/])/.test(s))) return "CNF";
  return undefined;
}

/** Uses a matching live snapshot before legacy ticket/SMS status, without rewriting original booking data. */
export function effectiveTicketStatus(journey: Pick<Journey, "pnr" | "pnrStatus" | "currentStatus" | "ticketStatus">) {
  if (journey.pnrStatus) return journey.pnrStatus.pnr === journey.pnr ? pnrSummary(journey.pnrStatus) : journey.ticketStatus;
  if (journey.currentStatus) {
    if (/WL|WAIT/i.test(journey.currentStatus)) return "WL";
    if (/RAC/i.test(journey.currentStatus)) return "RAC";
    if (/^(CNF|CONFIRMED)/i.test(journey.currentStatus)) return "CNF";
  }
  return journey.ticketStatus;
}

/** Records the checked status and its history; it never cancels the journey (the user confirms that separately). */
export function applyPnrStatus(journey: Journey, snapshot: PnrSnapshot): Journey {
  if (journey.pnr !== snapshot.pnr) throw new Error("PNR_CHANGED");
  const summary = pnrSummary(snapshot);
  const previous = journey.pnrStatus?.pnr === journey.pnr ? pnrSummary(journey.pnrStatus) : journey.currentStatus ?? journey.ticketStatus;
  const statusLog = summary && summary !== previous ? [...(journey.statusLog ?? []), { at: snapshot.checkedAt, status: summary }].slice(-40) : journey.statusLog;
  // A cancelled status never changes the journey by itself: the user confirms it (confirmPnrCancellation).
  return { ...journey, pnrStatus: snapshot, pnrLastAttemptAt: snapshot.checkedAt, pnrLastError: undefined, currentStatus: summary ?? "See passengers", statusLog };
}

/**
 * Whether to suggest a PNR check (never run one): a booked trip with a PNR within three days of travel that is
 * waitlisted or RAC, or hasn't been checked in the last 12 hours.
 */
export function suggestPnrCheck(journey: Journey, today: string, now = Date.now()): boolean {
  if (!journey.pnr || journey.status !== "booked") return false;
  const days = Math.round((Date.parse(`${journey.date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
  if (days < 0 || days > 3) return false;
  const snapshot = journey.pnrStatus?.pnr === journey.pnr ? journey.pnrStatus : undefined;
  const summary = snapshot ? pnrSummary(snapshot) : effectiveTicketStatus(journey);
  if (summary === "CANCELLED") return false;
  return summary === "WL" || summary === "RAC" || !snapshot || now - Date.parse(snapshot.checkedAt) > 12 * 3_600_000;
}
