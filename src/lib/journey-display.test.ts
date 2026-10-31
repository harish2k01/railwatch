import { expect, it } from "vitest";
import { groupTimeOff, stationLabel, timeOffGroups } from "./journey-display";

it("shortens imported station labels without guessing ordinary city names", () => {
  expect(stationLabel("MADURAI JN. - MDU")).toBe("MDU");
  expect(stationLabel("CHENNAI EGMORE - MS")).toBe("MS");
  expect(stationLabel("Chennai")).toBe("Chennai");
});

it("keeps an ongoing range intact and separates past entries without losing or mutating days", () => {
  const days = [
    {id:"a",name:"Leave",date:"2026-10-30",type:"leave" as const},
    {id:"b",name:"Leave",date:"2026-10-31",type:"leave" as const},
    {id:"c",name:"Leave",date:"2026-11-01",type:"leave" as const},
    {id:"d",name:"Old",date:"2026-10-01",type:"company" as const},
    {id:"e",name:"Recent",date:"2026-10-29",type:"company" as const},
    {id:"f",name:"Future",date:"2027-01-01",type:"company" as const},
  ];
  const original = structuredClone(days);
  const upcoming = timeOffGroups(days,"2026-10-31",false);
  const past = timeOffGroups(days,"2026-10-31",true);
  expect(upcoming.map(group=>group.days.map(day=>day.id))).toEqual([["a","b","c"],["f"]]);
  expect(past.map(group=>group.name)).toEqual(["Recent","Old"]);
  expect([...upcoming,...past].flatMap(group=>group.days)).toHaveLength(days.length);
  expect(days).toEqual(original);
  expect(timeOffGroups([],"2026-10-31",false)).toEqual([]);
});

it("groups matching consecutive leave while preserving original day IDs and separating gaps/types", () => {
  const days = [{ id: "3", name: "PTO", date: "2026-11-04", type: "leave" as const }, { id: "1", name: "PTO", date: "2026-11-02", type: "leave" as const }, { id: "2", name: "PTO", date: "2026-11-03", type: "leave" as const }, { id: "4", name: "PTO", date: "2026-11-06", type: "leave" as const }, { id: "5", name: "PTO", date: "2026-11-07", type: "company" as const }];
  const groups = groupTimeOff(days);
  expect(groups).toHaveLength(3);
  expect(groups[0]).toMatchObject({ start: "2026-11-02", end: "2026-11-04" });
  expect(groups[0].days.map(day => day.id)).toEqual(["1", "2", "3"]);
  expect(days[0].id).toBe("3");
});
