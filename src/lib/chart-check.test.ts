import { describe, expect, it } from "vitest";
import { chartCheckAt } from "./railwatch-jobs";

const base = { status: "booked", departure: "22:30", date: "2026-12-01", departureConfirmed: true };

describe("chartCheckAt", () => {
  it("is four hours before a confirmed IST departure for RAC and waitlisted tickets", () => {
    expect(chartCheckAt({ ...base, ticketStatus: "RAC" })?.toISOString()).toBe("2026-12-01T13:00:00.000Z");
    expect(chartCheckAt({ ...base, ticketStatus: "WL" })?.toISOString()).toBe("2026-12-01T13:00:00.000Z");
  });
  it("is skipped for confirmed, unknown, unbooked or unconfirmed-time journeys", () => {
    expect(chartCheckAt({ ...base, ticketStatus: "CNF" })).toBeUndefined();
    expect(chartCheckAt({ ...base })).toBeUndefined();
    expect(chartCheckAt({ ...base, ticketStatus: "WL", status: "needs_booking" })).toBeUndefined();
    expect(chartCheckAt({ ...base, ticketStatus: "WL", departureConfirmed: false })).toBeUndefined();
  });
});
