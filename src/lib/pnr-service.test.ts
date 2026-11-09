import { beforeEach, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ workspace: vi.fn(), planner: vi.fn(), save: vi.fn(), lookup: vi.fn(), notification: vi.fn() }));
vi.mock("./db", () => ({ prisma: { railWorkspace: { findUnique: mock.workspace }, railNotification: { createMany: mock.notification } } }));
vi.mock("./workspace-storage", () => ({ storedPlanner: mock.planner }));
vi.mock("./railwatch-store", () => ({ saveWorkspace: mock.save }));
vi.mock("./pnr-provider", () => ({ lookupPnr: mock.lookup }));
import { refreshPnr } from "./pnr-service";
import { EMPTY_PLANNER, journeySchema } from "./travel-planner";
import { parsePnrStatus } from "./pnr-status";
const j = journeySchema.parse({ id: "j", from: "MS", to: "MDU", date: "2026-12-01", departure: "21:00", train: "", travelClass: "3A", windowDays: 60, originOffset: 0, status: "booked", pnr: "1234567890", notes: "", ticketStatus: "RAC" });
const snapshot = parsePnrStatus({ PNR: j.pnr, passengers: [{ currentStatus: "CNF", bookingStatus: "RAC 4" }], other_info: [{ chartStatus: "Prepared" }] }, j.pnr);
beforeEach(() => {
  vi.resetAllMocks(); mock.workspace.mockResolvedValue({ version: 2 });
  mock.planner.mockResolvedValue({ ...EMPTY_PLANNER, journeys: [j] }); mock.lookup.mockResolvedValue(snapshot);
  mock.save.mockImplementation(async (_user, planner) => ({ planner, revision: 3 }));
});
it("does not invoke the provider for unavailable tickets", async () => {
  mock.planner.mockResolvedValue({ ...EMPTY_PLANNER, journeys: [] });
  await expect(refreshPnr("owner", "j")).rejects.toMatchObject({ status: 404 });
  expect(mock.lookup).not.toHaveBeenCalled();
});
it("preserves a successful snapshot on failure and records a safe attempt message", async () => {
  const old = { ...j, pnrStatus: snapshot };
  mock.planner.mockResolvedValue({ ...EMPTY_PLANNER, journeys: [old] }); mock.lookup.mockRejectedValue(new Error("provider details"));
  await expect(refreshPnr("owner", "j")).rejects.toThrow();
  const saved = mock.save.mock.calls[0][1].journeys[0];
  expect(saved.pnrStatus).toEqual(snapshot);
  expect(saved.pnrLastError).not.toContain("provider details");
});
it("discards a response when PNR changes during the lookup", async () => {
  mock.planner.mockResolvedValueOnce({ ...EMPTY_PLANNER, journeys: [j] }).mockResolvedValueOnce({ ...EMPTY_PLANNER, journeys: [{ ...j, pnr: "9999999999" }] });
  await expect(refreshPnr("owner", "j")).rejects.toMatchObject({ status: 409 });
  expect(mock.save).not.toHaveBeenCalled();
});
it("uses freshly loaded data and revision rather than overwriting an intervening edit", async () => {
  mock.workspace.mockResolvedValueOnce({ version: 2 }).mockResolvedValueOnce({ version: 3 });
  mock.planner.mockResolvedValueOnce({ ...EMPTY_PLANNER, journeys: [j] }).mockResolvedValueOnce({ ...EMPTY_PLANNER, journeys: [{ ...j, notes: "Edited during lookup" }] });
  const result = await refreshPnr("owner", "j");
  expect(result.journey.notes).toBe("Edited during lookup");
  expect(mock.save.mock.calls[0][2]).toBe(3);
  expect(mock.save.mock.calls[0][4]).toBe(true);
});
