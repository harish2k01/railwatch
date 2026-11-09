import { afterEach, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
const script = path.resolve("scripts/ntes/build-stations.mjs");
const roots: string[] = [];
function fixture(phase: string, type = "EXP") {
  const root = mkdtempSync(path.join(tmpdir(), "railwatch-stations-test-")); roots.push(root);
  mkdirSync(path.join(root, "src/data"), { recursive: true }); mkdirSync(path.join(root, "raw/schedules"), { recursive: true });
  writeFileSync(path.join(root, "src/data/stations.json"), '[["MS","Chennai Egmore"]]\n');
  writeFileSync(path.join(root, "raw/crawl-status.json"), JSON.stringify({ phase }));
  writeFileSync(path.join(root, "raw/schedules/12345.json"), JSON.stringify({ TrainType: type, stations: [{ StationCode: "MS", StationName: "CHENNAI EGMORE", STA: "Source", STD: "21:40", Halt: 0 }] }));
  return root;
}
afterEach(() => { for (const root of roots.splice(0)) { if (path.dirname(root) !== path.resolve(tmpdir()) || !path.basename(root).startsWith("railwatch-stations-test-")) throw Error("Unexpected fixture cleanup path"); rmSync(root, { recursive: true }); } });
it("preserves the bundled directory when the crawl is incomplete", () => {
  const root = fixture("INCOMPLETE"); const result = spawnSync(process.execPath, [script, "raw"], { cwd: root, encoding: "utf8" });
  expect(result.status).not.toBe(0); expect(result.stderr).toContain("Crawl incomplete");
  expect(readFileSync(path.join(root, "src/data/stations.json"), "utf8")).toBe('[["MS","Chennai Egmore"]]\n');
});
it("rejects a nominally complete crawl with insufficient coverage", () => {
  const root = fixture("DONE"); const result = spawnSync(process.execPath, [script, "raw"], { cwd: root, encoding: "utf8" });
  expect(result.status).not.toBe(0); expect(result.stderr).toContain("Incomplete or unusually reduced");
  expect(JSON.parse(readFileSync(path.join(root, "src/data/stations.json"), "utf8"))).toEqual([["MS", "Chennai Egmore"]]);
});
it("rejects unknown categories instead of treating them as long-distance", () => {
  const root = fixture("DONE", "UNKNOWN"); const result = spawnSync(process.execPath, [script, "raw"], { cwd: root, encoding: "utf8" });
  expect(result.stderr).toContain("Review unknown NTES train categories"); expect(result.status).not.toBe(0);
});
it("excludes Passenger-only services under the long-distance policy", () => {
  const root = fixture("DONE", "PAS"); const result = spawnSync(process.execPath, [script, "raw"], { cwd: root, encoding: "utf8" });
  expect(result.stderr).toContain("0 stops");
  // The refusal message reports counts; no directory is published from this small fixture.
  expect(result.status).not.toBe(0);
});
