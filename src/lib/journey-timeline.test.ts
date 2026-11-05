import { describe, expect, it } from "vitest";
import { journeySchema, type Rule } from "./travel-planner";
import { journeyTimeline } from "./journey-timeline";

const j = (id: string, date: string, ruleId?: string) => journeySchema.parse({ id, from: "MDU", to: "MS", date, departure: "20:00", train: "", travelClass: "SL", windowDays: 60, originOffset: 0, pnr: "", notes: "", status: "booked", ruleId });

describe("journeyTimeline", () => {
  const rules = [{ id: "r1", name: "Weekly office travel" }] as Rule[];
  it("groups one-off trips by week relative to today", () => {
    // 2026-11-05 is a Thursday; its week starts Monday 2 Nov.
    const g = journeyTimeline([j("a", "2026-11-06"), j("b", "2026-11-10"), j("c", "2026-11-12"), j("d", "2027-01-20")], "2026-11-05", rules);
    expect(g.weeks.map((w) => [w.label, w.journeys.map((x) => x.id)])).toEqual([["This week", ["a"]], ["Next week", ["b", "c"]], ["Later in January 2027", ["d"]]]);
  });
  it("collapses routine trips under their routine and keeps unknown routines as one-offs", () => {
    const g = journeyTimeline([j("a", "2026-11-10", "r1"), j("b", "2026-11-12", "r1"), j("c", "2026-11-12", "gone")], "2026-11-05", rules);
    expect(g.routines).toEqual([{ id: "r1", name: "Weekly office travel", journeys: [expect.objectContaining({ id: "a" }), expect.objectContaining({ id: "b" })] }]);
    expect(g.weeks[0].journeys.map((x) => x.id)).toEqual(["c"]);
  });
});
