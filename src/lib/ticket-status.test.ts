import { describe, expect, it } from "vitest";
import { parseTicketDetails } from "./ticket-details";
import { journeySchema } from "./travel-planner";

describe("ticket status", () => {
  it("reads CNF, RAC and waitlist variants from ticket text", () => {
    expect(parseTicketDetails("Booking Status Current Status\nCNF/B2/45/LOWER CNF/B2/45/LOWER").ticketStatus).toBe("CNF");
    expect(parseTicketDetails("Booking Status Current Status\nRAC 12 RAC 7").ticketStatus).toBe("RAC");
    expect(parseTicketDetails("Booking Status Current Status\nGNWL 34 GNWL 20").ticketStatus).toBe("WL");
  });
  it("is optional and validated on the journey payload", () => {
    const base = { id: "j", from: "A", to: "B", date: "2026-12-01", departure: "20:00", train: "", travelClass: "", windowDays: 60, originOffset: 0, pnr: "", notes: "", status: "booked" };
    expect(journeySchema.parse(base).ticketStatus).toBeUndefined();
    expect(journeySchema.parse({ ...base, ticketStatus: "RAC" }).ticketStatus).toBe("RAC");
    expect(() => journeySchema.parse({ ...base, ticketStatus: "XX" })).toThrow();
  });
});
