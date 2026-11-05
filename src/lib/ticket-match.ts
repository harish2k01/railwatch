import type { Journey } from "./travel-planner";
import type { TicketDetails } from "./ticket-details";

/** How an imported ticket relates to existing journeys (plan 3.3). */
export type TicketMatch = { kind: "matched"; journey: Journey } | { kind: "check"; candidates: Journey[]; reason: string } | { kind: "create" };

const norm = (value?: string) => (value ?? "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
/** True when a ticket station (code or name) plausibly refers to the journey station. */
const sameStation = (ticket: string | undefined, journey: string) => { const a = norm(ticket), b = norm(journey); return Boolean(a && b) && (a === b || a.startsWith(b) || b.startsWith(a)); };

/**
 * Matches extracted ticket details to journeys on the same travel date: a PNR match or a single
 * route match is Matched; several or route-less candidates need a Check; none means Create.
 */
export function matchTicket(details: TicketDetails, journeys: Journey[]): TicketMatch {
  if (!details.date) return { kind: "check", candidates: [], reason: "No travel date was found on this ticket." };
  const sameDay = journeys.filter(j => j.date === details.date && !["cancelled", "skipped", "completed"].includes(j.status));
  const byPnr = details.pnr ? sameDay.filter(j => j.pnr === details.pnr) : [];
  if (byPnr.length === 1) return { kind: "matched", journey: byPnr[0] };
  const byRoute = sameDay.filter(j => sameStation(details.from, j.from) && sameStation(details.to, j.to));
  if (byRoute.length === 1) return { kind: "matched", journey: byRoute[0] };
  if (byRoute.length > 1) return { kind: "check", candidates: byRoute, reason: "More than one journey on this date has this route." };
  if (sameDay.length) return { kind: "check", candidates: sameDay, reason: "A journey on this date has a different route." };
  return { kind: "create" };
}
