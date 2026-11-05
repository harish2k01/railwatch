import { bookingTimeLabel, bookingDay, daysBetween, formatDay, type Journey } from "./travel-planner";

/** One step of a journey timeline. */
export type Stage = { label: string; note: string; state: "done" | "current" | "todo"; warn?: boolean };

/** Builds the Planned → Booking opens → Booked → Travel timeline for one journey. */
export function journeyStages(j: Journey, today: string, routine?: string): Stage[] {
  const opens = bookingDay(j), booked = ["booked", "cancellation_needed", "cancelled", "completed"].includes(j.status);
  const hasTicket = Boolean(j.attachments?.length || j.pnr), travelled = j.date < today || j.status === "completed";
  const inDays = daysBetween(today, j.date);
  return [
    { label: "Planned", note: routine ? `Created by ${routine}` : "One-off trip", state: "done" },
    { label: opens <= today ? "Booking opened" : "Booking opens", note: `${formatDay(opens, { weekday: "short", day: "numeric", month: "short" })} · ${bookingTimeLabel(j).replace(" IST", "")}`, state: opens <= today ? "done" : "current" },
    { label: j.status === "cancellation_needed" ? "To cancel" : j.status === "cancelled" ? "Cancelled" : "Booked", note: booked ? (hasTicket ? "Ticket attached" : "Ticket not attached yet") : "Not yet", state: booked ? "done" : opens <= today ? "current" : "todo", warn: (booked && !hasTicket) || j.status === "cancellation_needed" },
    { label: "Travel", note: `${formatDay(j.date, { weekday: "short", day: "numeric", month: "short" })} · ${travelled ? "travelled" : inDays === 0 ? "today" : `in ${inDays} day${inDays === 1 ? "" : "s"}`}`, state: travelled ? "done" : booked ? "current" : "todo" },
  ];
}

