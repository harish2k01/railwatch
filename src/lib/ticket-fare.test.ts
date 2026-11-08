import { describe, expect, it } from "vitest";
import { parseFare } from "./ticket-fare";
describe("parseFare", () => {
  it("reads the ERS PDF/OCR lines and undoes a ₹ read as 2", () => {
    const ocr = ["Ticket Fare 340.00 SR A yg", "IRCTC Convenience Fee (Incl. of GST) 217.70 ela", "eWallet Transaction Charge X11.80 .- na", "Travel Insurance Premium (Incl. of GST) 20.45 hk", "Total Fare (all inclusive) 369.95 [=]"].join("\n");
    expect(parseFare(ocr)).toEqual({ total: 369.95, ticket: 340, convenience: 17.7, wallet: 11.8, insurance: 0.45 });
  });
  it("reads the email's label row and value row", () => {
    const email = "Ticket Fare Convenience Fee eWallet Transaction Charge Travel Insurance Premium Total Fare\nRs. 340.00 Rs. 17.70 Rs. 11.80 Rs. 0.45 Rs. 369.95 *";
    expect(parseFare(email)).toEqual({ ticket: 340, convenience: 17.7, wallet: 11.8, insurance: 0.45, total: 369.95 });
  });
  it("returns nothing without a total", () => { expect(parseFare("PNR 1234567890")).toBeUndefined(); });
});

describe("rupee sign read as a leading digit on the total", () => {
  it("drops it when the parts add up", () => {
    expect(parseFare("Ticket Fare 340.00\nIRCTC Convenience Fee (Incl. of GST) 11.80\nTravel Insurance Premium (Incl. of GST) 0.45\nTotal Fare (all inclusive) 3352.25")).toMatchObject({ total: 352.25, ticket: 340, convenience: 11.8, insurance: 0.45 });
  });
});
