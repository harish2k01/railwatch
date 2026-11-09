import type { TicketDetails } from "./ticket-details";
import { transitionJourney, type Journey, type Planner } from "./travel-planner";

export type MailApply = { planner: Planner; result: "attached" | "created" | "unchanged" | "unmatched"; journey?: Journey };

const AC = new Set(["1A", "2A", "3A", "3E", "CC", "EC"]);

/**
 * Applies ticket details read from an IRCTC booking email: matches the journey on date and route (any status except
 * cancelled), fills train, PNR, class, coach, seat, fare and status, and marks a planned trip booked. Without a match a
 * booked one-off journey is created, so a ticket booked outside a routine still shows up.
 */
export function applyTicketMail(planner: Planner, d: TicketDetails, newId: () => string): MailApply {
  if (!d.date || !d.from || !d.to || !d.pnr) return { planner, result: "unmatched" };
  const same = (j: Journey) => j.date === d.date && j.from.toUpperCase() === d.from && j.to.toUpperCase() === d.to && j.status !== "cancelled";
  const match = planner.journeys.find(j => same(j) && j.pnr === d.pnr) ?? planner.journeys.find(j => same(j) && !j.pnr) ?? planner.journeys.find(same);
  const tatkal = d.bookingType === "tatkal" ? { bookingType: "tatkal" as const, tatkalClass: AC.has(d.travelClass ?? "") ? "ac" as const : "non_ac" as const } : {};
  const fields: Partial<Journey> = {
    pnr: d.pnr, ...(d.trainNumber ? { trainNumber: d.trainNumber, train: d.trainNumber } : {}), ...(d.trainName ? { trainName: d.trainName } : {}),
    ...(d.travelClass ? { travelClass: d.travelClass } : {}), ...(d.coach ? { coach: d.coach } : {}), ...(d.seat ? { seat: d.seat } : {}), ...(d.berth ? { berth: d.berth } : {}), ...(d.arrival ? { arrival: d.arrival, arrivalDate: d.arrivalDate } : {}),
    ...(d.departure ? { departure: d.departure, departureConfirmed: true } : {}), ...(d.ticketStatus ? { ticketStatus: d.ticketStatus } : {}), ...(d.fare ? { fare: d.fare } : {}), ...tatkal,
  };
  if (match) {
    const next = { ...(match.status === "needs_booking" || match.status === "skipped" ? transitionJourney(match, "booked") : match), ...fields } as Journey;
    if (JSON.stringify(next) === JSON.stringify(match)) return { planner, result: "unchanged", journey: match };
    return { planner: { ...planner, journeys: planner.journeys.map(j => j.id === match.id ? next : j) }, result: "attached", journey: next };
  }
  const created: Journey = {
    id: newId(), date: d.date, from: d.from, to: d.to, departure: d.departure ?? "00:00", departureConfirmed: Boolean(d.departure),
    train: d.trainNumber ?? "", travelClass: d.travelClass ?? "", windowDays: 60, originOffset: 0, status: "booked", notes: "", ...fields, pnr: d.pnr,
  };
  return { planner: { ...planner, journeys: [...planner.journeys, created] }, result: "created", journey: created };
}

/**
 * Applies IRCTC's cancellation email: the journey with that PNR becomes cancelled (IRCTC confirms a cancellation the
 * user made) and the refund is recorded on its fare for Spend. Unknown PNRs change nothing.
 */
export function applyCancelMail(planner: Planner, c: { pnr: string; refund?: number }): MailApply {
  const match = planner.journeys.find(j => j.pnr === c.pnr);
  if (!match) return { planner, result: "unmatched" };
  const base = ["booked", "cancellation_needed", "needs_booking"].includes(match.status) ? transitionJourney(match, "cancelled") : match;
  const next: Journey = { ...base, ...(c.refund !== undefined && match.fare ? { fare: { ...match.fare, refund: c.refund } } : {}) };
  if (JSON.stringify(next) === JSON.stringify(match)) return { planner, result: "unchanged", journey: match };
  return { planner: { ...planner, journeys: planner.journeys.map(j => j.id === match.id ? next : j) }, result: "attached", journey: next };
}
