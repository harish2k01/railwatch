import { describe, expect, it } from "vitest";
import { journeySchema } from "./travel-planner";
import { journeyStages } from "./journey-stages";

const journey = (over: Record<string, unknown>) => journeySchema.parse({ id: "j", from: "MDU", to: "MS", date: "2026-12-10", departure: "20:00", train: "", travelClass: "SL", windowDays: 60, originOffset: 0, pnr: "", notes: "", status: "needs_booking", ...over });

describe("journeyStages", () => {
  it("marks booking as the current step before it opens", () => {
    const st = journeyStages(journey({}), "2026-09-01", "Weekly home trip");
    expect(st.map((s) => s.label)).toEqual(["Planned", "Booking opens", "Booked", "Travel"]);
    expect(st[0].note).toBe("Weekly home trip");
    expect(st[1].state).toBe("current");
    expect(st[2].state).toBe("todo");
  });
  it("flags a booked journey without a ticket and counts days to travel", () => {
    const st = journeyStages(journey({ status: "booked" }), "2026-12-05");
    expect(st[1].label).toBe("Booking opened");
    expect(st[2]).toMatchObject({ state: "done", note: "No ticket", warn: true });
    expect(st[3]).toMatchObject({ state: "current", note: "in 5 days" });
  });
  it("treats a PNR as a ticket and past travel as done", () => {
    const st = journeyStages(journey({ status: "booked", pnr: "1234567890" }), "2026-12-11");
    expect(st[2]).toMatchObject({ note: "Ticket attached", warn: false });
    expect(st[3]).toMatchObject({ state: "done", note: "Done" });
  });
});
