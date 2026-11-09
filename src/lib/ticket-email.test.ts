import { describe, expect, it } from "vitest";
import { emailText, isTicketEmail, parseTicketEmail , isCancelEmail, parseCancelEmail } from "./ticket-email";

// Dummy values in the layout of an IRCTC booking-confirmation email (no real ticket data).
const row = (...cells: string[]) => `<tr>${cells.map(c => `<td>${c}</td>`).join("")}</tr>`;
const html = `<html><head><style>td{}</style></head><body><p>Ticket Confirmation</p><table>
${row("PNR No. :", "<a href='#'>1234567890</a>", "Train No. / Name :", "12632 / NELLAI SF EXP", "Quota :", "GENERAL")}
${row("Transaction ID :", "100000000000001", "Date &amp; Time of Booking :", "08-Nov-2026 08:00:52 am HRS", "Class :", "SLEEPER CLASS")}
${row("From :", "MADURAI JN. (MDU)", "Date of Journey :", "05-Jan-2027", "To :", "CHENNAI EGMORE (MS)")}
${row("Boarding At :", "MDU", "Date Of Boarding :", "05-Jan-2027", "Scheduled Departure* :", "N.A.")}
${row("Reservation Up to :", "CHENNAI EGMORE ( MS)", "Scheduled Arrival :", "N.A.", "Adult: 1", "Child: 0")}
</table><p>Passenger Details</p><table>
${row("Sl. No.", "Name", "Age", "Gender", "Catering Service Option", "Status", "Coach", "Seat / Berth / WL No")}
${row("1", "TEST USER", "30", "Male", "N/A", "CNF", "S7", "27")}
</table><p>Fare Details (Inclusive of GST)</p><table>
${row("Ticket Fare", "Convenience Fee", "eWallet Transaction Charge", "Travel Insurance Premium", "Total Fare")}
${row("Rs. 340.00", "Rs. 17.70", "Rs. 11.80", "Rs. 0.45", "Rs. 369.95 *")}
</table></body></html>`;

describe("IRCTC booking email", () => {
  it("reads train, PNR, stations, class, quota, berth, status and fare", () => {
    expect(parseTicketEmail(emailText(html))).toEqual({
      pnr: "1234567890", trainNumber: "12632", trainName: "NELLAI SF EXP", date: "2027-01-05", from: "MDU", to: "MS",
      travelClass: "SL", bookingType: "normal", ticketStatus: "CNF", coach: "S7", seat: "27",
      fare: { ticket: 340, convenience: 17.7, wallet: 11.8, insurance: 0.45, total: 369.95 },
    });
  });
  it("reads waitlist, Tatkal, 3A and a departure time", () => {
    const wl = html.replace("GENERAL", "TATKAL").replace("SLEEPER CLASS", "AC 3 TIER").replace(">CNF<", ">WL 12<").replace(">S7<", ">-<").replace(">27<", ">12<").replace("Scheduled Departure* :</td><td>N.A.", "Scheduled Departure* :</td><td>23:10");
    expect(parseTicketEmail(emailText(wl))).toMatchObject({ bookingType: "tatkal", travelClass: "3A", ticketStatus: "WL", departure: "23:10" });
  });
  it("recognises the sender and subject", () => {
    expect(isTicketEmail("IRCTC <ticketadmin@irctc.co.in>", "Booking Confirmation on IRCTC, Train: 12632, 05-Jan-2027, SL, MDU - MS")).toBe(true);
    expect(isTicketEmail("someone@example.com", "Booking Confirmation")).toBe(false);
  });
});

describe("IRCTC cancellation email", () => {
  // Dummy PNR; wording as IRCTC sends it.
  const text = "Dear Customer,\nWe wish to inform you that your ticket against PNR Number: 1234567890 has been cancelled successfully as per your request. The refund amount of Rs. 255.36 will be refunded back to your respective account shortly.";
  it("recognises the sender and subject, not booking confirmations", () => {
    expect(isCancelEmail("ticketadmin@irctc.co.in", "Cancel Ticket")).toBe(true);
    expect(isCancelEmail("ticketadmin@irctc.co.in", "Booking Confirmation on IRCTC, Train: 12632")).toBe(false);
    expect(isCancelEmail("someone@example.com", "Cancel Ticket")).toBe(false);
  });
  it("reads the PNR and refund", () => { expect(parseCancelEmail(text)).toEqual({ pnr: "1234567890", refund: 255.36 }); });
  it("ignores an eWallet top-up", () => { expect(parseCancelEmail("you have successfully deposited Rs 400.0 in your IRCTC eWallet account")).toBeUndefined(); });
});
