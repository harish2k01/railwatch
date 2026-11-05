import { describe, expect, it } from "vitest";
import { journeySchema } from "./travel-planner";
import { matchTicket } from "./ticket-match";

const j = (id: string, over: Record<string, unknown> = {}) => journeySchema.parse({ id, from: "MDU", to: "MS", date: "2026-12-01", departure: "20:00", train: "", travelClass: "", windowDays: 60, originOffset: 0, pnr: "", notes: "", status: "needs_booking", ...over });

describe("matchTicket", () => {
  it("matches by PNR, then by route on the same date", () => {
    expect(matchTicket({ date: "2026-12-01", pnr: "1234567890" }, [j("a", { pnr: "1234567890" }), j("b")])).toMatchObject({ kind: "matched", journey: { id: "a" } });
    expect(matchTicket({ date: "2026-12-01", from: "MDU", to: "MS" }, [j("a"), j("b", { from: "MS", to: "MDU" })])).toMatchObject({ kind: "matched", journey: { id: "a" } });
    expect(matchTicket({ date: "2026-12-01", from: "MADURAI JN (MDU)", to: "MS" }, [j("a", { from: "MADURAI JN" })])).toMatchObject({ kind: "matched" });
  });
  it("asks to check ambiguous or mismatched dates and creates when nothing is planned", () => {
    expect(matchTicket({ date: "2026-12-01", from: "MDU", to: "MS" }, [j("a"), j("b")])).toMatchObject({ kind: "check", candidates: [{ id: "a" }, { id: "b" }] });
    expect(matchTicket({ date: "2026-12-01", from: "SBC", to: "MAS" }, [j("a")])).toMatchObject({ kind: "check" });
    expect(matchTicket({ date: "2026-12-02", from: "MDU", to: "MS" }, [j("a")])).toEqual({ kind: "create" });
    expect(matchTicket({ from: "MDU" }, [j("a")])).toMatchObject({ kind: "check", candidates: [] });
  });
  it("ignores cancelled, skipped and completed journeys", () => {
    expect(matchTicket({ date: "2026-12-01", from: "MDU", to: "MS" }, [j("a", { status: "cancelled" })])).toEqual({ kind: "create" });
  });
});
