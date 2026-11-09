import { describe, expect, it } from "vitest";
import { parseSharedPnr, sharedPnrSummary } from "./pnr-text";

// Dummy PNRs only.
describe("parseSharedPnr", () => {
  it("reads current status, coach and berth from copied result text", () => {
    const text = "PNR Number : 1234567890\nPassenger 1\tWL/12\tCNF/S5/32/LB\nPassenger 2\tWL/13\tCNF/S5/35/UB\nCharting Status : Chart Prepared";
    const p = parseSharedPnr(text);
    expect(p.pnr).toBe("1234567890");
    expect(p.chartPrepared).toBe(true);
    expect(p.passengers).toEqual([{ status: "CNF", coach: "S5", berth: "32", berthType: "LB" }, { status: "CNF", coach: "S5", berth: "35", berthType: "UB" }]);
    expect(sharedPnrSummary(p)).toBe("CNF");
  });
  it("reads waitlist and RAC, chart not prepared", () => {
    const p = parseSharedPnr("PNR No.: 1234567890\n1 GNWL 40 RLWL 4\n2 RAC 18 RAC 6\nChart Not Prepared");
    expect(p.chartPrepared).toBe(false);
    expect(p.passengers.map(x => x.status)).toEqual(["WL", "RAC"]);
    expect(p.passengers[0].position).toBe(4);
    expect(sharedPnrSummary(p)).toBe("WL");
  });
  it("treats a ticket as cancelled only when every passenger is", () => {
    expect(sharedPnrSummary(parseSharedPnr("Passenger 1 CNF/B1/12 CAN\nPassenger 2 CNF/B1/13 CAN"))).toBe("CAN");
    expect(sharedPnrSummary(parseSharedPnr("Passenger 1 CNF/B1/12 CAN\nPassenger 2 CNF/B1/13 CNF/B1/13"))).toBe("CNF");
  });
  it("finds nothing in unrelated text", () => { expect(parseSharedPnr("hello").passengers).toEqual([]); });
});
