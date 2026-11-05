import { describe, expect, it } from "vitest";
import { journeySchema, migratePlanner, skipForTimeOff, EMPTY_PLANNER } from "./travel-planner";

const j = (over: Record<string, unknown>) => journeySchema.parse({ id: "j", from: "MDU", to: "MS", date: "2026-11-09", departure: "20:00", train: "", travelClass: "", windowDays: 60, originOffset: 0, pnr: "", notes: "", status: "needs_booking", ...over });

describe("skipForTimeOff", () => {
  it("skips a one-off trip without touching routines", () => {
    const planner = { ...migratePlanner(EMPTY_PLANNER), journeys: [j({})] };
    const next = skipForTimeOff(planner, planner.journeys[0]);
    expect(next.journeys[0].status).toBe("skipped");
    expect(next.rules).toBe(planner.rules);
  });
  it("records a routine exception so the trip is not generated again", () => {
    const base = migratePlanner(EMPTY_PLANNER);
    const rule = { id: "r1", name: "Office", from: "MDU", to: "MS", start: "2026-11-01", end: null, weekdays: [1], excludedDates: ["2026-11-02"] };
    const planner = { ...base, rules: [rule as unknown as typeof base.rules[number]], journeys: [j({ ruleId: "r1" })] };
    const next = skipForTimeOff(planner, planner.journeys[0]);
    expect(next.rules[0].excludedDates).toEqual(["2026-11-02", "2026-11-09"]);
    expect(next.journeys[0].status).toBe("skipped");
  });
});
