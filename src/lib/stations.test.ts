import { describe, expect, it } from "vitest";
import { searchStations, type Station } from "./stations";
import stations from "@/data/stations.json";

const rows: Station[] = [["MDU", "Madurai JN"], ["MS", "Chennai Egmore"], ["MAS", "Chennai Central"], ["MDUK", "Mudukulathur"], ["SBC", "Bangalore City JN"]];

describe("searchStations", () => {
  it("ranks exact code, then code prefix, then names", () => {
    expect(searchStations(rows, "md").map((r) => r[0])).toEqual(["MDU", "MDUK"]);
    expect(searchStations(rows, "chennai").map((r) => r[0])).toEqual(["MS", "MAS"]);
    expect(searchStations(rows, "ms")[0][0]).toBe("MS");
  });
  it("puts matching recent stations first and lists them for an empty query", () => {
    expect(searchStations(rows, "", ["sbc", "MDU", "SBC"]).map((r) => r[0])).toEqual(["SBC", "MDU"]);
    expect(searchStations(rows, "c", ["SBC"])[0][0]).toBe("SBC");
  });
  it("keeps unknown recent entries and limits results", () => {
    expect(searchStations(rows, "", ["Home town"])).toEqual([["HOME TOWN", ""]]);
    expect(searchStations(rows, "a", [], 2)).toHaveLength(2);
  });
  it("ships a usable directory", () => {
    const codes = new Map((stations as unknown as Station[]).map((s) => [s[0], s[1]]));
    expect(codes.size).toBeGreaterThan(8000);
    expect(codes.get("MDU")).toBe("Madurai JN");
  });
});
