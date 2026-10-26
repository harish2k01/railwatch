import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { addDays, bookingDay, bookingInstant, bookingPhase, calendarFile, cancellationStatus, DEFAULT_CLOCK, effectiveReminders, EMPTY_PLANNER, extendRoutines, findBreaks, generateJourneys, migratePlanner, parseHolidayCSV, removeRule, saveLinkedRule, saveRule, transitionJourney, type Journey, type Rule } from "./travel-planner";

const rule: Rule = { id: "routine", name: "Custom commute", from: "Station A", to: "Station B", train: "12345", travelClass: "3A", windowDays: 60, originOffset: 0, start: "2026-12-01", end: "2026-12-31", weekdays: [2], intervalWeeks: 1, departure: "22:00", returnAfterDays: 2, returnDeparture: "21:00", returnTrain: "54321", returnOriginOffset: 1, paused: false, excludedDates: [] };
const journey: Journey = { id: "journey", from: "A", to: "B", train: "", travelClass: "SL", windowDays: 60, originOffset: 0, date: "2026-12-01", departure: "22:00", status: "needs_booking", pnr: "", notes: "" };
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-01T00:00:00Z")); });
afterEach(() => vi.useRealTimers());

it("removes only untouched future occurrences and unlinks the retained return routine",()=>{
  const base={...journey,ruleId:rule.id};
  const protectedJourneys=[{...base,id:"booked",status:"booked" as const,pnr:"1234567890"},{...base,id:"manual",manualOverride:true},{...base,id:"archived",archivedAt:"2026-10-20"},{...base,id:"cancelled",status:"cancelled" as const},{...base,id:"past",date:"2026-10-20"},{...journey,id:"unrelated"}];
  const planner={...EMPTY_PLANNER,rules:[{...rule,linkedRuleId:"return"},{...rule,id:"return",linkedRuleId:rule.id}],journeys:[{...base,id:"future"},...protectedJourneys]};
  const next=removeRule(planner,rule.id,"2026-10-25");
  expect(next.journeys).toEqual(protectedJourneys);expect(next.rules).toHaveLength(1);expect(next.rules[0].id).toBe("return");expect(next.rules[0].linkedRuleId).toBeUndefined();
  expect(planner.journeys).toHaveLength(7);expect(planner.rules).toHaveLength(2);
});

describe("booking deadlines", () => {
  it("uses exactly 60 days, including year boundaries and leap days", () => {
    expect(bookingDay(journey)).toBe("2026-10-02");
    expect(bookingDay({ ...journey, date: "2027-01-01" })).toBe("2026-11-02");
    expect(addDays("2028-03-01", -1)).toBe("2028-02-29");
  });
  it("uses the common booking window and ignores retired individual adjustments", () => {
    expect(bookingDay({ ...journey, originOffset: 1, bookingDateOverride: "2026-09-01" })).toBe("2026-10-02");
    expect(bookingDay({ ...journey, windowDays: 30 })).toBe("2026-11-01");
    expect(bookingInstant(journey).toISOString()).toBe("2026-10-02T02:30:00.000Z");
  });
  it("does not call booking open before 8 AM IST, or on a past journey", () => {
    expect(bookingPhase(journey, new Date("2026-10-02T02:29:59Z"))).toBe("upcoming");
    expect(bookingPhase(journey, new Date("2026-10-02T02:30:00Z"))).toBe("today");
    expect(bookingPhase(journey, new Date("2026-12-02T00:00:00Z"))).toBe("past");
  });
});

describe("expanded recurrence and journey history", () => {
  const recurrence = { frequency: "daily" as const, interval: 3, monthlyPattern: "date" as const, dayOfMonth: 31, ordinal: -1, weekday: 5 };
  const base = { ...rule, returnAfterDays: null, recurrence };
  it("anchors custom daily intervals to the start date", () => {
    expect(generateJourneys({ ...base, end: "2026-12-10" }, "2026-12-02").map(j => j.date)).toEqual(["2026-12-04", "2026-12-07", "2026-12-10"]);
  });
  it("skips months that lack a selected day", () => {
    expect(generateJourneys({ ...base, start: "2026-12-01", end: "2027-04-01", recurrence: { ...recurrence, frequency: "monthly", interval: 1 } }).map(j => j.date)).toEqual(["2026-12-31", "2027-01-31", "2027-03-31"]);
  });
  it("finds the last Friday and third Tuesday of a month", () => {
    expect(generateJourneys({ ...base, recurrence: { ...recurrence, frequency: "monthly", interval: 1, monthlyPattern: "weekday" } }).map(j => j.date)).toEqual(["2026-12-25"]);
    expect(generateJourneys({ ...base, recurrence: { ...recurrence, frequency: "monthly", interval: 1, monthlyPattern: "weekday", ordinal: 3, weekday: 2 } }).map(j => j.date)).toEqual(["2026-12-15"]);
  });
  it("keeps yearly leap-day recurrence on February 29", () => {
    expect(generateJourneys({ ...base, start: "2024-02-29", end: null, recurrence: { ...recurrence, frequency: "yearly", interval: 1 } }, "2028-01-01").map(j => j.date)).toEqual(["2028-02-29"]);
    expect(generateJourneys({ ...base, start: "2024-02-29", end: null, recurrence: { ...recurrence, frequency: "yearly", interval: 1 } }, "2027-01-01")).toEqual([]);
  });
  it("retains ticket data in every status transition including cancellation and completion", () => {
    const ticket = { ...journey, trainName: "Express", pnr: "1234567890", seat: "42", attachments: [{ id: "f", name: "ticket.pdf", type: "application/pdf" as const, size: 100, createdAt: "2026-10-01T00:00:00Z" }] };
    for (const status of ["booked", "needs_booking", "cancellation_needed", "cancelled", "completed"] as const) expect(transitionJourney(ticket, status)).toMatchObject({ ...ticket, status });
  });
  it("excludes archived and completed journeys from calendar exports", () => {
    const text = calendarFile({ ...EMPTY_PLANNER, journeys: [{ ...journey, status: "completed" }, { ...journey, id: "archived", archivedAt: "2026-10-01" }] });
    expect(text).not.toContain("BEGIN:VEVENT");
  });
  it("applies shared booking days to newly extended routine plans", () => {
    const data = extendRoutines({ ...EMPTY_PLANNER, settings: { ...EMPTY_PLANNER.settings, bookingWindowDays: 45 }, rules: [base] }, "2026-12-01");
    expect(data.journeys.every(j => j.windowDays === 45)).toBe(true);
  });
});
describe("customizable routines", () => {
  it("generates selected dates without requiring a train or class", () => {
    const generated = generateJourneys(rule);
    expect(generated).toHaveLength(10);
    expect(generated[0].date).toBe("2026-12-01");
    expect(generated[0]).toMatchObject({ train: "", travelClass: "", originOffset: 0 });
    expect(generated[1]).toMatchObject({ date: "2026-12-03", from: "Station B", to: "Station A" });
  });
  it("supports alternate weeks from a stable Monday anchor", () => {
    expect(generateJourneys({ ...rule, intervalWeeks: 2, returnAfterDays: null }).map(j => j.date)).toEqual(["2026-12-01", "2026-12-15", "2026-12-29"]);
  });
  it("rejects backwards ranges and bounds ongoing generation to six months", () => {
    expect(() => generateJourneys({ ...rule, end: "2026-11-01" })).toThrow();
    const ongoing = generateJourneys({ ...rule, end: null, returnAfterDays: null }, "2026-12-01");
    expect(ongoing.length).toBeGreaterThan(20);
    expect(ongoing.every(j => j.date <= "2027-06-01")).toBe(true);
  });
  it("preserves booked tickets and skipped exceptions when editing a routine", () => {
    const planner = saveRule(EMPTY_PLANNER, rule);
    planner.journeys[0] = { ...planner.journeys[0], status: "booked", pnr: "1234567890" };
    planner.journeys[2] = { ...planner.journeys[2], status: "skipped" };
    const edited = saveRule(planner, { ...rule, from: "Changed station", end: "2026-12-15" });
    expect(edited.journeys.find(j => j.id === planner.journeys[0].id)).toEqual(planner.journeys[0]);
    expect(edited.journeys.find(j => j.id === planner.journeys[2].id)?.status).toBe("skipped");
    expect(edited.journeys.filter(j => j.status === "needs_booking").every(j => j.from === "Changed station" || j.to === "Changed station")).toBe(true);
    expect(new Set(edited.journeys.map(j => j.id)).size).toBe(edited.journeys.length);
  });
  it("keeps booked cancellations actionable", () => {
    expect(cancellationStatus("booked")).toBe("cancellation_needed");
    expect(cancellationStatus("needs_booking")).toBe("skipped");
  });
  it("preserves a rescheduled individual journey as an exception", () => {
    const planner = saveRule(EMPTY_PLANNER, rule);
    planner.journeys[0] = { ...planner.journeys[0], date: "2026-12-02", manualOverride: true };
    const edited = saveRule(planner, { ...rule, departure: "19:00" });
    expect(edited.journeys.find(j => j.id === planner.journeys[0].id)).toEqual(planner.journeys[0]);
  });
});
describe("holiday planning", () => {
  it("spots holiday weekends and prompts planning before booking opens", () => {
    const planner = { ...EMPTY_PLANNER, holidays: [{ id: "h", date: "2026-10-02", name: "Company holiday", type: "company" as const }] };
    const opportunity = findBreaks(planner, "2026-06-01")[0];
    expect(opportunity).toMatchObject({ start: "2026-10-02", end: "2026-10-04", days: 3, planBy: "2026-08-03", bookingAlreadyOpen: false });
    expect(findBreaks(planner, "2026-10-01")[0].bookingAlreadyOpen).toBe(true);
  });
  it("uses personal working days and groups several holidays into one opportunity", () => {
    const planner = { ...EMPTY_PLANNER, settings: { ...EMPTY_PLANNER.settings, weekendDays: [0] }, holidays: [{ id: "a", date: "2027-01-01", name: "New Year", type: "company" as const }, { id: "b", date: "2027-01-02", name: "Leave", type: "leave" as const }] };
    expect(findBreaks(planner, "2026-10-01")[0]).toMatchObject({ days: 3, names: ["New Year", "Leave"] });
    expect(findBreaks({ ...planner, holidays: [] }, "2026-10-01")).toHaveLength(0);
  });
  it("imports quoted names and rejects malformed dates atomically", () => {
    expect(parseHolidayCSV('date,name,type\n2027-01-01,"New Year, company",company\n')).toEqual([{ date: "2027-01-01", name: "New Year, company", type: "company" }]);
    expect(() => parseHolidayCSV("date,name,type\n2027-02-30,Bad date,company")).toThrow(/row 2/);
    expect(() => parseHolidayCSV('date,name,type\n2027-01-01,"Unclosed,company')).toThrow(/unclosed/);
  });
});
describe("calendar export", () => {
  it("exports IST instants, reminder alarms, escaped names and no cancelled tickets", () => {
    const file = calendarFile({ ...EMPTY_PLANNER, journeys: [journey, { ...journey, id: "cancelled", status: "cancelled" }] });
    expect(file).toContain("DTSTART:20261002T023000Z");
    expect(file).toContain("DTSTART;VALUE=DATE:20261201");
    expect(file).toContain("TRIGGER;VALUE=DATE-TIME:20261001T143000Z");
    expect(file.match(/BEGIN:VALARM/g)).toHaveLength(3);
    expect(file).not.toContain("UID:cancelled");
    expect(file.match(/BEGIN:VEVENT/g)).toHaveLength(2);
    expect(file.split("\r\n").every(line => new TextEncoder().encode(line).length <= 75)).toBe(true);
  });
});

describe("ongoing routines and overrides", () => {
  it("extends an ongoing routine idempotently without resurrecting skipped dates", () => {
    const ongoing = { ...rule, end: null, returnAfterDays: null };
    const initial = saveRule(EMPTY_PLANNER, ongoing, "2026-12-01");
    initial.journeys[0].status = "skipped";
    const next = extendRoutines(initial, "2027-01-01");
    expect(next.journeys.length).toBeGreaterThan(initial.journeys.length);
    expect(next.journeys[0].status).toBe("skipped");
    expect(extendRoutines(next, "2027-01-01")).toBe(next);
    expect(new Set(next.journeys.map(j => j.id)).size).toBe(next.journeys.length);
  });
  it("supports excluded dates and pause without deleting recorded tickets", () => {
    expect(generateJourneys({ ...rule, returnAfterDays: null, excludedDates: ["2026-12-01"] }, "2026-12-01").some(j => j.date === "2026-12-01")).toBe(false);
    const planner = saveRule(EMPTY_PLANNER, rule, "2026-12-01");
    planner.journeys[0].status = "booked";
    const paused = saveRule(planner, { ...rule, paused: true }, "2026-12-01");
    expect(paused.journeys).toHaveLength(1);
    expect(extendRoutines(paused, "2027-01-01")).toBe(paused);
  });
  it("links independently scheduled reverse routines reciprocally and supports unlinking", () => {
    const onward = { ...rule, returnAfterDays: null };
    const initial = saveRule(EMPTY_PLANNER, onward, "2026-12-01");
    const back: Rule = { ...onward, id: "return", from: rule.to, to: rule.from, weekdays: [4], intervalWeeks: 2, linkedRuleId: rule.id };
    const linked = saveLinkedRule(initial, back, "2026-12-01");
    expect(linked.rules.find(r => r.id === rule.id)?.linkedRuleId).toBe("return");
    expect(linked.rules.find(r => r.id === "return")?.intervalWeeks).toBe(2);
    const unlinked = saveLinkedRule(linked, { ...back, linkedRuleId: undefined }, "2026-12-01");
    expect(unlinked.rules.every(r => !r.linkedRuleId)).toBe(true);
    expect(() => saveLinkedRule(initial, { ...back, from: "Wrong station" }, "2026-12-01")).toThrow(/opposite routes/);
  });
  it("resolves defaults → routine → journey and exports only effective alarms", () => {
    const off = { mode: "off" as const, times: [], clock: DEFAULT_CLOCK };
    const custom = { mode: "custom" as const, times: ["morning" as const], clock: { ...DEFAULT_CLOCK, morning: "06:30" } };
    const j = { ...journey, ruleId: rule.id };
    const planner = { ...EMPTY_PLANNER, rules: [{ ...rule, reminderOverride: off }], journeys: [j] };
    expect(effectiveReminders(planner, j).times).toEqual([]);
    const overridden = { ...j, reminderOverride: custom };
    expect(effectiveReminders(planner, overridden)).toEqual({ times: ["morning"], clock: custom.clock });
    expect(calendarFile(planner)).not.toContain("BEGIN:VALARM");
    const calendar = calendarFile({ ...planner, journeys: [overridden] });
    expect(calendar.match(/BEGIN:VALARM/g)).toHaveLength(1);
    expect(calendar).toContain("TRIGGER;VALUE=DATE-TIME:20261002T010000Z");
  });
  it("migrates legacy bundled returns into linked routines without losing tickets", () => {
    const legacy = saveRule(EMPTY_PLANNER, rule, "2026-12-01");
    legacy.journeys[1].status = "booked"; legacy.journeys[1].pnr = "1234567890";
    const migrated = migratePlanner(legacy);
    expect(migrated.rules).toHaveLength(2);
    expect(migrated.rules.every(r => r.returnAfterDays === null && r.linkedRuleId)).toBe(true);
    const booked = migrated.journeys.find(j => j.pnr === "1234567890")!;
    expect(booked.ruleId).toBe("routine:linked-return");
    expect(booked.date).toBe("2026-12-03");
    expect(migratePlanner(migrated)).toEqual(migrated);
  });
  it("does not offer public holidays or an extra holiday lead-time setting", () => {
    expect(() => parseHolidayCSV("date,name,type\n2027-01-01,Old category,public")).toThrow();
    expect(EMPTY_PLANNER.settings).not.toHaveProperty("holidayLeadDays");
  });
});

 describe("admin routine planning limits",()=>{
 const routine:Rule={id:"limits",name:"Weekly",from:"A",to:"B",train:"",travelClass:"",windowDays:60,originOffset:0,start:"2026-10-06",end:null,weekdays:[2],intervalWeeks:1,departure:"20:00",returnAfterDays:null,returnDeparture:"20:00",returnTrain:"",returnOriginOffset:0,paused:false,excludedDates:[]};
 it("anchors the month boundary to today, including future starts",()=>{expect(generateJourneys({...routine,start:"2027-05-01"},"2026-10-02")).toEqual([]);const generated=generateJourneys(routine,"2026-10-02");expect(generated.at(-1)?.date).toBe("2027-03-30");});
 it("fills and replenishes the configured count without duplicates",()=>{const settings={...EMPTY_PLANNER.settings,routineHorizonMode:"count" as const,routineTicketCount:3};const first=saveRule({...EMPTY_PLANNER,settings},routine,"2026-10-02");expect(first.journeys.map(j=>j.date)).toEqual(["2026-10-06","2026-10-13","2026-10-20"]);const later=extendRoutines(first,"2026-10-07");expect(later.journeys.filter(j=>j.date>="2026-10-07")).toHaveLength(3);expect(new Set(later.journeys.map(j=>j.id)).size).toBe(later.journeys.length);});
 it("shrinks generated plans while preserving bookings and individual edits",()=>{const wide=saveRule(EMPTY_PLANNER,routine,"2026-10-02");wide.journeys[4].status="booked";wide.journeys[5].manualOverride=true;const narrow=extendRoutines({...wide,settings:{...wide.settings,routineHorizonMode:"count",routineTicketCount:2}},"2026-10-02");expect(narrow.journeys).toHaveLength(4);expect(narrow.journeys.some(j=>j.status==="booked")).toBe(true);expect(narrow.journeys.some(j=>j.manualOverride)).toBe(true);expect(extendRoutines(narrow,"2026-10-02")).toBe(narrow);});
 });
