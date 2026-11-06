import { describe, expect, it } from "vitest";
import { parseTicketDetails } from "./ticket-details";
describe("ticket extraction suggestions", () => {
  it("reads labeled PDF text with separate train and optional allocation fields", () => {
    const details = parseTicketDetails("PNR No: 1234567890\nTrain No./Name: 12637 / PANDIAN EXP\nClass: 3A\nDate of Journey: 01/12/2026\nFrom: CHENNAI\nTo: MADURAI\nCoach: B1\nSeat No: 42\nBerth: LB\nDeparture Time: 21:30");
    expect(details).toEqual({ pnr: "1234567890", trainNumber: "12637", trainName: "PANDIAN EXP", travelClass: "3A", date: "2026-12-01", from: "CHENNAI", to: "MADURAI", coach: "B1", seat: "42", berth: "LB", departure: "21:30" });
  });
  it("reads understandable QR JSON aliases", () => {
    expect(parseTicketDetails(JSON.stringify({ PNR: 1234567890, trainNo: "12637", trainName: "Express", seatNo: 42, berthType: "Lower", journeyDate: "01-12-2026" }))).toMatchObject({ pnr: "1234567890", trainNumber: "12637", trainName: "Express", seat: "42", berth: "Lower", date: "2026-12-01" });
  });
  it("reads confirmed passenger allocations", () => { expect(parseTicketDetails("CNF/B1/42/LB")).toEqual({ coach: "B1", seat: "42", berth: "LB", ticketStatus: "CNF" }); });
  it("discards invalid critical values and handles opaque QR payloads", () => {
    expect(parseTicketDetails(JSON.stringify({ pnr: "123", date: "2026-02-30", departure: "25:10", trainNumber: "ABCD" }))).toEqual({});
    expect(parseTicketDetails("opaque-encrypted-QR-payload")).toEqual({});
  });
});

it("reads long berth names and scheduled departure without a colon",()=>{expect(parseTicketDetails("Current Status\nCNF / B2 / 56 / SIDE LOWER\nScheduled Departure\n21:45")).toMatchObject({coach:"B2",seat:"56",berth:"SIDE LOWER",departure:"21:45"});});
it("reads nested QR passengers and normalized keys",()=>{expect(parseTicketDetails(JSON.stringify({"PNR Number":"1234567890",passengers:[{"Coach No":"S2","Berth No":17,"Berth Type":"LOWER"}],"Scheduled Departure":"9:15 PM"}))).toMatchObject({coach:"S2",seat:"17",berth:"LOWER",departure:"21:15"});});

it("reads delimited QR text without including neighboring fields",()=>{expect(parseTicketDetails("PNR:1234567890,TrainNo:12637,TrainName:PANDIAN EXP,From:CHENNAI,To:MADURAI,Class:AC 3 Tier (3A),Coach:B1,SeatNo:42,BerthType:LOWER,DepartureTime:21:30")).toMatchObject({from:"CHENNAI",to:"MADURAI",trainNumber:"12637",trainName:"PANDIAN EXP",travelClass:"3A",coach:"B1",seat:"42",berth:"LOWER",departure:"21:30"});});

it("prefers current allocation over the original booking allocation",()=>{expect(parseTicketDetails("Booking Status: CNF/B1/24/UPPER\nCurrent Status: CNF/B2/56/LOWER")).toMatchObject({coach:"B2",seat:"56",berth:"LOWER"});});

it("reads an OCR-ed IRCTC ERS where labels and values sit in table rows", () => {
  const text = ["Electronic Reservation Slip (ERS)-Normal User", "Booked From Boarding At To", "MADURAI JN. (MDU) MADURAI JN. (MDU) CHENNAI EGMORE (MS)", "Start Date* 05-Jan-2027 Departure* N.A. Arrival* N.A.", "PNR Train No./Name Class", "9876543210 12632 / NELLAI SF EXP SLEEPER CLASS (SL)", "Quota Distance Booking Date", "GENERAL (GN) 497 KM 06-Nov-2026 08:01:04 HRS", "Passenger Details", "# Name Age Gender Booking Status Current Status", "1. PASSENGER 25 M CNF/S7/27/UPPER CNF /S7/27/UPPER"].join("\n");
  expect(parseTicketDetails(text)).toMatchObject({ pnr: "9876543210", trainNumber: "12632", trainName: "NELLAI SF EXP", travelClass: "SL", from: "MDU", to: "MS", date: "2027-01-05", coach: "S7", seat: "27", berth: "UPPER", ticketStatus: "CNF" });
});

it("reads the labels-on-their-own-lines layout, Tatkal quota and chair-car seats", () => {
  const text = ["PNR", "4123456789", "Train No./Name", "12636/VAIGAI SF EXP", "Class", "AC CHAIR CAR (CC)", "Quota", "TATKAL (TQ)", "Booked From", "MADURAI JN (MDU)", "Start Date* 05-Jan-2027", "To", "CHENNAI EGMORE (MS)", "Booking Status Current Status", "1. A 30 M CNF/D2/45/WS CNF/D2/45/WS"].join("\n");
  expect(parseTicketDetails(text)).toMatchObject({ pnr: "4123456789", trainNumber: "12636", travelClass: "CC", from: "MDU", to: "MS", date: "2027-01-05", coach: "D2", seat: "45", berth: "WS", bookingType: "tatkal" });
});

it("reads two-letter coach codes", () => {
  expect(parseTicketDetails("CNF/HA1/7/LOWER")).toMatchObject({ coach: "HA1", seat: "7", berth: "LOWER" });
});
