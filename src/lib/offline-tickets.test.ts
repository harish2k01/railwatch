import { describe, expect, it } from "vitest";
import { offlineTargets } from "./offline-tickets";

const pdf = (id: string) => ({ id, name: id + ".pdf", type: "application/pdf" });
describe("offlineTargets", () => {
  it("keeps PDFs of booked journeys travelling in the window only", () => {
    const journeys = [
      { id: "a", date: "2026-11-06", from: "MDU", to: "MS", status: "booked", attachments: [pdf("t1"), { id: "img", name: "qr.png", type: "image/png" }] },
      { id: "b", date: "2026-11-10", from: "MS", to: "MDU", status: "booked", attachments: [pdf("t2")] },
      { id: "c", date: "2026-11-07", from: "MS", to: "MDU", status: "needs_booking", attachments: [pdf("t3")] },
      { id: "d", date: "2026-11-04", from: "MS", to: "MDU", status: "booked", attachments: [pdf("t4")] },
    ];
    expect(offlineTargets(journeys, "2026-11-05", "2026-11-08")).toEqual([{ id: "t1", name: "t1.pdf", journeyId: "a", date: "2026-11-06", label: "MDU → MS", pnr: "", train: "", coach: "", berth: "", departure: "" }]);
  });
});
