import { describe, expect, it } from "vitest";
import { parseBookingStatus } from "./ticket-status";
describe("parseBookingStatus", () => {
  it("reads typed statuses", () => {
    expect(parseBookingStatus("wl 12")).toEqual({ ticketStatus: "WL", currentStatus: "WL 12" });
    expect(parseBookingStatus("RAC 3")).toEqual({ ticketStatus: "RAC", currentStatus: "RAC 3" });
    expect(parseBookingStatus("cnf")).toEqual({ ticketStatus: "CNF", currentStatus: "CNF" });
  });
  it("takes the current status from a PNR SMS", () => {
    expect(parseBookingStatus("PNR:4123456789,TRN:12632,DOJ:05-01-27,SL,MDU-MS,P1-GNWL24/WL4")).toEqual({ ticketStatus: "WL", currentStatus: "WL 4" });
    expect(parseBookingStatus("PNR 4123456789 P1 RAC 7, chart not prepared")).toEqual({ ticketStatus: "RAC", currentStatus: "RAC 7" });
  });
  it("ignores text with no status", () => { expect(parseBookingStatus("hello")).toBeUndefined(); });
});
