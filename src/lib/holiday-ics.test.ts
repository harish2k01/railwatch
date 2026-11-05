import { describe, expect, it } from "vitest";
import { parseHolidayICS } from "./holiday-ics";

const ics = (...events: string[]) => ["BEGIN:VCALENDAR", "VERSION:2.0", ...events, "END:VCALENDAR"].join("\r\n");
const ev = (...lines: string[]) => ["BEGIN:VEVENT", ...lines, "END:VEVENT"].join("\r\n");

describe("parseHolidayICS", () => {
  it("reads all-day events and expands multi-day ranges (DTEND exclusive)", () => {
    const text = ics(ev("DTSTART;VALUE=DATE:20261109", "DTEND;VALUE=DATE:20261110", "SUMMARY:Diwali"), ev("DTSTART;VALUE=DATE:20261225", "DTEND;VALUE=DATE:20261227", "SUMMARY:Christmas\\, break"));
    expect(parseHolidayICS(text)).toEqual([
      { date: "2026-11-09", name: "Diwali", type: "company" },
      { date: "2026-12-25", name: "Christmas, break", type: "company" },
      { date: "2026-12-26", name: "Christmas, break", type: "company" },
    ]);
  });
  it("skips timed events, unfolds long lines and honours the chosen type", () => {
    const text = ics(ev("DTSTART:20261110T090000Z", "SUMMARY:Standup"), ev("DTSTART;VALUE=DATE:20270101", "SUMMARY:New", " Year"));
    expect(parseHolidayICS(text, "leave")).toEqual([{ date: "2027-01-01", name: "NewYear", type: "leave" }]);
  });
  it("rejects files that are not calendars or have no all-day events", () => {
    expect(() => parseHolidayICS("date,name,type")).toThrow("calendar");
    expect(() => parseHolidayICS(ics(ev("DTSTART:20261110T090000Z", "SUMMARY:Standup")))).toThrow("No all-day events");
  });
});
