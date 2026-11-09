import { describe, expect, it } from "vitest";
import { applyPnrStatus, parsePnrStatus, pnrSummary, effectiveTicketStatus } from "./pnr-status";
import { journeySchema } from "./travel-planner";

const pnr = "1234567890";
const response = { PNR: pnr, passengers: [{ passengerSerialNumber: "1", bookingStatus: "RAC 4", currentStatus: "CNF", currentCoachId: "B2", currentBerthNo: 34 }], other_info: [{ chartStatus: "Prepared" }, { bookingFare: "450" }] };
const journey = journeySchema.parse({ id: "j", from: "MAS", to: "MDU", date: "2026-12-01", departure: "21:00", train: "", travelClass: "3A", windowDays: 60, originOffset: 0, status: "booked", pnr, notes: "Keep", ticketStatus: "RAC", fare: { total: 500, ticket: 450, convenience: 50 } });
describe("PNR status", () => {
  it("normalizes passengers and chart status but deliberately omits fares", () => {
    const snapshot = parsePnrStatus(response, pnr, new Date("2026-11-09T12:00:00Z"));
    expect(snapshot.passengers[0]).toEqual({ number: 1, booking: "RAC 4", current: "CNF", coach: "B2", berth: "34" });
    expect(snapshot.chartStatus).toBe("Prepared");
    expect(snapshot).not.toHaveProperty("fare");
  });
  it("never treats a mixed PNR as fully confirmed", () => {
    const snapshot = parsePnrStatus({ ...response, passengers: [...response.passengers, { passengerSerialNumber: "2", bookingStatus: "WL 5", currentStatus: "RLWL 2" }] }, pnr);
    expect(pnrSummary(snapshot)).toBe("WL");
    expect(pnrSummary({ ...snapshot, passengers: [{ ...snapshot.passengers[0], current: "CAN" }] })).toBe("CANCELLED");
  });
  it("rejects missing, erroneous, empty and mismatched responses", () => {
    for (const bad of [null, {}, { errorMessage: "Flushed" }, { ...response, PNR: "9999999999" }, { ...response, passengers: [] }, { ...response, passengers: [{}] }]) expect(() => parsePnrStatus(bad, pnr)).toThrow();
  });
  it("preserves original booking, fare, lifecycle and passenger-independent details", () => {
    const snapshot = parsePnrStatus(response, pnr);
    const next = applyPnrStatus(journey, snapshot);
    expect(next.ticketStatus).toBe("RAC");
    expect(next.currentStatus).toBe("CNF");
    expect(next.fare).toEqual(journey.fare);
    expect(next.status).toBe("booked");
    expect(next.statusLog).toHaveLength(1);
    expect(applyPnrStatus(next, snapshot).statusLog).toHaveLength(1);
    expect(() => applyPnrStatus({ ...journey, pnr: "9999999999" }, snapshot)).toThrow();
  });
});

it("prefers the matching live status and ignores snapshots for an edited PNR",()=>{const snapshot=parsePnrStatus(response,pnr);expect(effectiveTicketStatus({...journey,pnrStatus:snapshot})).toBe("CNF");expect(effectiveTicketStatus({...journey,pnr:"9999999999",pnrStatus:snapshot,currentStatus:"CNF"})).toBe("RAC");});

it("moves a fully cancelled active PNR into Cancelled without inferring a refund",()=>{for(const status of ["booked","cancellation_needed"] as const){const snapshot=parsePnrStatus({...response,passengers:[{currentStatus:"CAN"},{currentStatus:"CANCELLED"}]},pnr,new Date("2026-11-09T12:00:00Z"));const next=applyPnrStatus({...journey,status},snapshot);expect(next.status).toBe("cancelled");expect(next.cancelledAt).toBe("2026-11-09");expect(next.fare).toEqual(journey.fare);}});
it("keeps partial and ambiguous cancellations active",()=>{for(const states of [["CAN","CNF"],["CAN","WL 4"],["CAN","UNKNOWN"]]){const snapshot=parsePnrStatus({...response,passengers:states.map(currentStatus=>({currentStatus}))},pnr);expect(applyPnrStatus(journey,snapshot).status).toBe("booked");}});
