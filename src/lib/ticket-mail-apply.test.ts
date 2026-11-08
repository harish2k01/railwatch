import { describe, expect, it } from "vitest";
import { applyTicketMail } from "./ticket-mail-apply";
import { EMPTY_PLANNER, type Journey } from "./travel-planner";

const planned: Journey = { id: "j1", date: "2027-01-05", from: "MDU", to: "MS", departure: "22:00", train: "", travelClass: "", windowDays: 60, originOffset: 0, status: "needs_booking", pnr: "", notes: "" };
const details = { pnr: "1234567890", trainNumber: "12632", trainName: "NELLAI SF EXP", date: "2027-01-05", from: "MDU", to: "MS", travelClass: "SL", ticketStatus: "CNF" as const, coach: "S7", seat: "27", fare: { total: 369.95, ticket: 340 } };

describe("applyTicketMail", () => {
  it("books the matching planned journey and fills the ticket", () => {
    const out = applyTicketMail({ ...EMPTY_PLANNER, journeys: [planned] }, details, () => "new");
    expect(out.result).toBe("attached");
    expect(out.journey).toMatchObject({ id: "j1", status: "booked", pnr: "1234567890", trainNumber: "12632", coach: "S7", seat: "27", fare: { total: 369.95 } });
  });
  it("is idempotent for the same email", () => {
    const once = applyTicketMail({ ...EMPTY_PLANNER, journeys: [planned] }, details, () => "new");
    expect(applyTicketMail(once.planner, details, () => "new").result).toBe("unchanged");
  });
  it("creates a booked one-off when nothing matches, and Tatkal gets a class", () => {
    const out = applyTicketMail(EMPTY_PLANNER, { ...details, bookingType: "tatkal", travelClass: "3A" }, () => "new");
    expect(out.result).toBe("created");
    expect(out.journey).toMatchObject({ id: "new", status: "booked", bookingType: "tatkal", tatkalClass: "ac" });
  });
  it("ignores mail without date, route or PNR", () => {
    expect(applyTicketMail(EMPTY_PLANNER, { pnr: "1234567890" }, () => "x").result).toBe("unmatched");
  });
});
