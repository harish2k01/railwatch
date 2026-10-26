import { z } from "zod";

const daySchema = z.string().refine(isDay, "Use a valid YYYY-MM-DD date.");
export const statusSchema = z.enum(["needs_booking", "booked", "skipped", "cancellation_needed", "cancelled", "completed"]);
export const attachmentSchema = z.object({ id: z.string(), name: z.string().min(1).max(255), type: z.enum(["application/pdf", "image/png", "image/jpeg", "image/webp"]), size: z.number().int().min(1).max(10485760), createdAt: z.string().datetime() });
export type TicketAttachment = z.infer<typeof attachmentSchema>;
export const recurrenceSchema = z.object({ frequency: z.enum(["daily", "weekly", "monthly", "yearly"]), interval: z.number().int().min(1).max(365), monthlyPattern: z.enum(["date", "weekday"]), dayOfMonth: z.number().int().min(1).max(31), ordinal: z.number().int().min(-1).max(5).refine(v => v !== 0), weekday: z.number().int().min(0).max(6) });
export const REMINDER_KEYS = ["previous_evening", "morning", "opening"] as const;
const clock = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
export const reminderScheduleSchema = z.array(z.object({ daysBefore: z.number().int().min(0).max(365), time: clock })).max(20);
export type ReminderSchedule = z.infer<typeof reminderScheduleSchema>;
export const DEFAULT_TATKAL_SCHEDULE: ReminderSchedule = [{ daysBefore: 1, time: "20:00" }, { daysBefore: 0, time: "09:30" }, { daysBefore: 0, time: "09:55" }];
export const reminderClockSchema = z.object({ previous_evening: clock, morning: clock, opening: clock });
export const DEFAULT_CLOCK = { previous_evening: "20:00", morning: "07:00", opening: "07:55" };
export const reminderOverrideSchema = z.object({ mode: z.enum(["inherit", "off", "custom"]), times: z.array(z.enum(REMINDER_KEYS)), clock: reminderClockSchema, schedule: reminderScheduleSchema.optional() });
export type ReminderOverride = z.infer<typeof reminderOverrideSchema>;
const routeFields = {
  from: z.string().trim().min(1).max(80), to: z.string().trim().min(1).max(80),
  train: z.string().trim().max(80), travelClass: z.string().max(30),
  windowDays: z.number().int().min(1).max(365), originOffset: z.number().int().min(0).max(7),
};
export const journeySchema = z.object({
  ...routeFields, id: z.string(), date: daySchema, departure: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  ruleId: z.string().optional(), leg: z.enum(["outbound", "return"]).optional(), manualOverride: z.boolean().optional(),
  reminderOverride: reminderOverrideSchema.optional(), timePreference: z.enum(["any", "morning", "afternoon", "evening", "night"]).optional(),
  departureConfirmed: z.boolean().optional(),
  bookingDateOverride: daySchema.optional(),
  bookingType: z.enum(["normal", "tatkal"]).optional(), tatkalClass: z.enum(["ac", "non_ac"]).optional(), trainOriginDate: daySchema.optional(),
  cancellationReminder: z.object({ enabled: z.boolean(), time: clock, schedule: reminderScheduleSchema.optional() }).optional(),
  trainNumber: z.string().max(20).optional(), trainName: z.string().max(100).optional(), coach: z.string().max(20).optional(), seat: z.string().max(30).optional(), berth: z.string().max(30).optional(),
  completedAt:daySchema.optional(), cancelledAt: daySchema.optional(), archivedAt: daySchema.optional(), attachments: z.array(attachmentSchema).max(20).optional(),
  status: statusSchema, pnr: z.string().regex(/^$|^\d{10}$/), notes: z.string().max(1000),
}).refine(j=>j.bookingType!=="tatkal"||Boolean(j.tatkalClass&&j.trainOriginDate&&j.trainOriginDate<=j.date),"Choose the Tatkal class and a train starting date on or before travel.");
export const ruleSchema = z.object({
  ...routeFields, id: z.string(), name: z.string().trim().min(1).max(80), start: daySchema, end: daySchema.nullable(),
  linkedRuleId: z.string().optional(), paused: z.boolean().default(false), excludedDates: z.array(daySchema).default([]),
  reminderOverride: reminderOverrideSchema.optional(), timePreference: z.enum(["any", "morning", "afternoon", "evening", "night"]).optional(),
  recurrence: recurrenceSchema.optional(),
  weekdays: z.array(z.number().int().min(0).max(6)).min(1), intervalWeeks: z.number().int().min(1).max(12),
  departure: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/), returnAfterDays: z.number().int().min(0).max(30).nullable(),
  returnDeparture: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  returnTrain: z.string().max(80), returnOriginOffset: z.number().int().min(0).max(7),
}).refine(r => r.from.toLowerCase() !== r.to.toLowerCase(), "Choose different stations.")
  .refine(r => !r.end || r.end >= r.start, "The end date must be on or after the start date.");
export const holidaySchema = z.object({ id: z.string(), name: z.string().trim().min(1).max(100), date: daySchema, type: z.enum(["company", "leave"]) });
export const plannerSchema = z.object({
  version: z.literal(1), journeys: z.array(journeySchema).max(10000), rules: z.array(ruleSchema).max(100), holidays: z.array(holidaySchema).max(3000),
  settings: z.object({ quietHours:z.object({enabled:z.boolean(),start:clock,end:clock}).refine(value=>!value.enabled||value.start!==value.end,{message:"Quiet hours must have different start and end times."}).optional(), bookingSchedule:reminderScheduleSchema.optional(),tatkalSchedule:reminderScheduleSchema.optional(),tatkalNonAcSchedule:reminderScheduleSchema.optional(),cancellationTime:clock.default("09:00"),cancellationEnabled:z.boolean().default(true),cancellationSchedule:reminderScheduleSchema.optional(),emailEnabled:z.boolean().default(false),telegramEnabled:z.boolean().default(false),telegramChatId:z.string().max(30).default(""),telegramProviderId:z.string().max(80).default(""), weekStartsOn:z.union([z.literal(0),z.literal(1)]).default(0),routineHorizonMode:z.enum(["months","count"]).default("months"),routineMonthsAhead:z.number().int().min(1).max(24).default(6),routineTicketCount:z.number().int().min(1).max(100).default(26), whatsappEnabled: z.boolean().default(false), sidebarCollapsed: z.boolean().default(false), bookingWindowDays: z.number().int().min(1).max(365).default(60), theme: z.enum(["light", "dark"]).default("light"), weekendDays: z.array(z.number().int().min(0).max(6)).max(6), reminderTimes: z.array(z.enum(REMINDER_KEYS)), reminderClock: reminderClockSchema.default(DEFAULT_CLOCK), whatsappNumber: z.string().max(20) }),
});
export type Journey = z.infer<typeof journeySchema>;
export type Rule = z.infer<typeof ruleSchema>;
export type Holiday = z.infer<typeof holidaySchema>;
export type Planner = z.infer<typeof plannerSchema>;
export type JourneyStatus = Journey["status"];
export const EMPTY_PLANNER: Planner = { version: 1, journeys: [], rules: [], holidays: [], settings: { cancellationTime:"09:00",cancellationEnabled:true,emailEnabled:false,telegramEnabled:false,telegramChatId:"",telegramProviderId:"",weekStartsOn:0,routineHorizonMode:"months",routineMonthsAhead:6,routineTicketCount:26,whatsappEnabled: false, sidebarCollapsed: false, bookingWindowDays: 60, theme: "light", weekendDays: [0, 6], reminderTimes: ["previous_evening", "morning", "opening"], reminderClock: DEFAULT_CLOCK, whatsappNumber: "" } };
const DAY_MS = 86400000;
/** Validates a real calendar date in YYYY-MM-DD format. */
export function isDay(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === value;
}
/** Shifts a calendar date by whole days without local timezone drift. */
export function addDays(day: string, count: number) { return new Date(new Date(`${day}T00:00:00Z`).getTime() + count * DAY_MS).toISOString().slice(0, 10); }
/** Calculates the whole-day difference between two calendar dates. */
export function daysBetween(a: string, b: string) { return Math.round((new Date(`${b}T00:00:00Z`).getTime() - new Date(`${a}T00:00:00Z`).getTime()) / DAY_MS); }
/** Returns the weekday index for a calendar date. */
export function weekday(day: string) { return new Date(`${day}T00:00:00Z`).getUTCDay(); }
/** Returns the current date in the application travel timezone, Asia/Kolkata. */
export function todayIST(now = new Date()) { return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(now); }
/** Formats a calendar date for display using the requested date components. */
export function formatDay(day: string, options: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", weekday: "short" }) { return new Intl.DateTimeFormat("en-IN", { ...options, timeZone: "UTC" }).format(new Date(`${day}T00:00:00Z`)); }
/** Calculates the shared advance-booking date for a journey. */
export function bookingDay(journey: Pick<Journey, "date" | "windowDays" | "originOffset" | "bookingDateOverride"> & Partial<Pick<Journey,"bookingType"|"tatkalClass"|"trainOriginDate">>) { return journey.bookingType === "tatkal" ? addDays(journey.trainOriginDate ?? journey.date, -1) : addDays(journey.date, -journey.windowDays); }
/** Returns the normal or Tatkal booking-opening instant in IST. */
export function bookingInstant(journey: Pick<Journey, "date" | "windowDays" | "originOffset" | "bookingDateOverride"> & Partial<Pick<Journey,"bookingType"|"tatkalClass"|"trainOriginDate">>) { return new Date(`${bookingDay(journey)}T${bookingClock(journey)}:00+05:30`); }
/** Returns the quota-specific booking opening time in IST. */
export function bookingClock(journey:Partial<Pick<Journey,"bookingType"|"tatkalClass">>) { return journey.bookingType === "tatkal" ? journey.tatkalClass === "non_ac" ? "11:00" : "10:00" : "08:00"; }
/** Formats the opening clock for reminder messages. */
export function bookingTimeLabel(journey:Partial<Journey>) { const hour=Number(bookingClock(journey).slice(0,2));return `${hour}:00 AM IST`; }
/** Classifies a booking window relative to the current instant. */
export function bookingPhase(journey: Journey, now = new Date()) {
  if (journey.date < todayIST(now)) return "past";
  if (bookingInstant(journey) > now) return "upcoming";
  return bookingDay(journey) === todayIST(now) ? "today" : "open";
}
/** Expands recurrence into bounded deterministic journey occurrences. */
export function generateJourneys(raw: Rule, today = todayIST(), settings = EMPTY_PLANNER.settings): Journey[] {
  const rule = ruleSchema.parse(raw);
  const result: Journey[] = [];
  const anchor = addDays(rule.start, -((weekday(rule.start) + 6) % 7));
  if (rule.paused) return result;
  const start = rule.start > today ? rule.start : today;
  const boundary = new Date(`${today}T00:00:00Z`);
  const day = boundary.getUTCDate();
  boundary.setUTCDate(1); boundary.setUTCMonth(boundary.getUTCMonth() + settings.routineMonthsAhead);
  boundary.setUTCDate(Math.min(day, new Date(Date.UTC(boundary.getUTCFullYear(), boundary.getUTCMonth()+1,0)).getUTCDate()));
  const countSpan = settings.routineTicketCount * (rule.recurrence?.frequency === "yearly" ? 366 * rule.recurrence.interval : rule.recurrence?.frequency === "monthly" ? 31 * rule.recurrence.interval : rule.recurrence?.frequency === "daily" ? rule.recurrence.interval : 7 * (rule.recurrence?.interval ?? rule.intervalWeeks)) + 366;
  const horizon = settings.routineHorizonMode === "count" ? addDays(start, Math.min(countSpan, daysBetween(start,"9999-12-31"))) : boundary.toISOString().slice(0,10);
  const end = rule.end && rule.end < horizon ? rule.end : horizon;
  for (let date = start; date <= end; date = addDays(date, 1)) {
    const recurrence = rule.recurrence;
    const week = Math.floor(daysBetween(anchor, date) / 7);
    let matches = rule.weekdays.includes(weekday(date)) && week % rule.intervalWeeks === 0;
    if (recurrence) {
      const d = new Date(`${date}T00:00:00Z`), startDate = new Date(`${rule.start}T00:00:00Z`);
      const months = (d.getUTCFullYear() - startDate.getUTCFullYear()) * 12 + d.getUTCMonth() - startDate.getUTCMonth();
      if (recurrence.frequency === "daily") matches = daysBetween(rule.start, date) % recurrence.interval === 0;
      if (recurrence.frequency === "weekly") matches = rule.weekdays.includes(weekday(date)) && week % recurrence.interval === 0;
      if (recurrence.frequency === "monthly") matches = months % recurrence.interval === 0 && (recurrence.monthlyPattern === "date" ? d.getUTCDate() === recurrence.dayOfMonth : weekday(date) === recurrence.weekday && (recurrence.ordinal === -1 ? new Date(`${addDays(date, 7)}T00:00:00Z`).getUTCMonth() !== d.getUTCMonth() : Math.ceil(d.getUTCDate() / 7) === recurrence.ordinal));
      if (recurrence.frequency === "yearly") matches = (d.getUTCFullYear() - startDate.getUTCFullYear()) % recurrence.interval === 0 && date.slice(5) === rule.start.slice(5);
    }
    if (!matches || rule.excludedDates.includes(date)) continue;
    const base = { from: rule.from, to: rule.to, train: "", trainName: "", trainNumber: "", travelClass: "", windowDays: rule.windowDays, originOffset: 0, departure: rule.departure, timePreference: rule.timePreference ?? "any" as const, status: "needs_booking" as const, pnr: "", notes: "", ruleId: rule.id };
    result.push({ ...base, id: `${rule.id}:${date}:outbound`, date, leg: "outbound" });
    if (rule.returnAfterDays !== null) {
      const returnDate = addDays(date, rule.returnAfterDays);
      result.push({ ...base, id: `${rule.id}:${date}:return`, date: returnDate, from: rule.to, to: rule.from, departure: rule.returnDeparture, train: rule.returnTrain, originOffset: rule.returnOriginOffset, leg: "return" });
    }
    if(settings.routineHorizonMode === "count" && result.length >= settings.routineTicketCount) break;
  }
  return settings.routineHorizonMode === "count" ? result.slice(0,settings.routineTicketCount) : result;
}
/** Identifies occurrence records that routine edits and removal must retain. */
function protectedRoutineOccurrence(journey:Journey,today:string){return journey.status!=="needs_booking"||Boolean(journey.manualOverride||journey.archivedAt)||journey.date<today;}
/** Regenerates a routine while retaining booked tickets and individually changed journeys. */
export function saveRule(planner: Planner, rule: Rule, today = todayIST()): Planner {
  const generated = generateJourneys({...rule,windowDays:planner.settings.bookingWindowDays}, today, planner.settings);
  const existing = new Map(planner.journeys.map(j => [j.id, j]));
  // Preserve booked tickets and explicit exceptions, including dates removed from the rule.
  const preserved = planner.journeys.filter(j => j.ruleId !== rule.id || protectedRoutineOccurrence(j,today));
  const preservedIds = new Set(preserved.map(j => j.id));
  const additions = generated.filter(j => !preservedIds.has(j.id)).map(j => ({ ...j, notes: existing.get(j.id)?.notes ?? "" }));
  return { ...planner, rules: [...planner.rules.filter(r => r.id !== rule.id), rule], journeys: [...preserved, ...additions] };
}
/** Removes a routine and untouched future plans while preserving tickets, exceptions and history. */
export function removeRule(planner:Planner,id:string,today=todayIST()):Planner{
  return {...planner,rules:planner.rules.filter(rule=>rule.id!==id).map(rule=>rule.linkedRuleId===id?{...rule,linkedRuleId:undefined}:rule),journeys:planner.journeys.filter(journey=>journey.ruleId!==id||protectedRoutineOccurrence(journey,today))};
}
export const CANCELLED_RETENTION_DAYS = 7;
/** Completes past booked journeys and archives cancelled plans after their retention period. */
export function reconcileJourneyLifecycle(planner:Planner,today:string):Planner{
 let changed=false;
 const journeys=planner.journeys.map(j=>{
  if(j.archivedAt)return j;
  if(j.status==="booked"&&j.date<today){changed=true;return {...j,status:"completed" as const,completedAt:addDays(j.date,1)};}
  if(j.status==="cancelled"||j.status==="skipped"){
   const cancelledAt=j.cancelledAt&&j.cancelledAt<=today?j.cancelledAt:today;
   const archivedAt=daysBetween(cancelledAt,today)>=CANCELLED_RETENTION_DAYS?today:undefined;
   if(cancelledAt!==j.cancelledAt||archivedAt){changed=true;return {...j,cancelledAt,archivedAt};}
  }else if(j.cancelledAt){changed=true;return {...j,cancelledAt:undefined};}
  return j;
 });
 return changed?{...planner,journeys}:planner;
}
/** Replenishes active routines to the instance planning horizon. */
export function extendRoutines(planner: Planner, today: string): Planner {
  let next = planner;
  for (const rule of planner.rules.filter(r => !r.paused)) next = saveRule(next, rule, today);
  return JSON.stringify(next) === JSON.stringify(planner) ? planner : next;
}
/** Formats a routine recurrence for its card and editor. */
export function recurrenceLabel(rule: Rule) {
  const r = rule.recurrence;
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  if (!r || r.frequency === "weekly") { const n = r?.interval ?? rule.intervalWeeks; return `${n === 1 ? "Weekly" : `Every ${n} weeks`} · ${rule.weekdays.map(d => days[d]).join(", ")}`; }
  const n = r.interval;
  if (r.frequency === "daily") return n === 1 ? "Every day" : `Every ${n} days`;
  if (r.frequency === "yearly") return `${n === 1 ? "Yearly" : `Every ${n} years`} · ${formatDay(rule.start, { day: "numeric", month: "long" })}`;
  const pattern = r.monthlyPattern === "date" ? `day ${r.dayOfMonth}` : `${r.ordinal === -1 ? "last" : ["", "first", "second", "third", "fourth", "fifth"][r.ordinal]} ${days[r.weekday]}`;
  return `${n === 1 ? "Monthly" : `Every ${n} months`} · ${pattern}`;
}
/** Changes journey status while retaining ticket details and recording cancellation timing. */
export function transitionJourney(journey: Journey, status: JourneyStatus): Journey { return { ...journey, status, completedAt:status==="completed"?(journey.completedAt??todayIST()):undefined, cancelledAt:["cancelled","skipped"].includes(status)?(journey.status===status?journey.cancelledAt:todayIST()):undefined, ...(journey.ruleId ? { manualOverride: true } : {}) }; }
/** Updates a routine and its explicitly linked counterpart without losing existing tickets. */
export function saveLinkedRule(planner: Planner, rule: Rule, today = todayIST()): Planner {
  const target = planner.rules.find(r => r.id === rule.linkedRuleId);
  if (rule.linkedRuleId && (!target || target.id === rule.id)) throw new Error("Choose another existing routine to link.");
  if (target && (target.from.toLowerCase() !== rule.to.toLowerCase() || target.to.toLowerCase() !== rule.from.toLowerCase())) throw new Error("Linked routines must have opposite routes. Each can use its own days and frequency.");
  if (target?.linkedRuleId && target.linkedRuleId !== rule.id) throw new Error("That routine is already linked to another routine. Unlink it first.");
  const next = saveRule(planner, rule, today);
  next.rules = next.rules.map(r => r.id === target?.id ? { ...r, linkedRuleId: rule.id } : r.id !== rule.id && r.linkedRuleId === rule.id ? { ...r, linkedRuleId: undefined } : r);
  return next;
}
/** Resolves journey overrides, routine preferences, and account defaults. */
export function effectiveReminders(planner: Planner, journey: Journey) {
  const routine = planner.rules.find(r => r.id === journey.ruleId)?.reminderOverride;
  const override = journey.reminderOverride?.mode !== "inherit" ? journey.reminderOverride : undefined;
  const chosen = override ?? (routine?.mode !== "inherit" ? routine : undefined);
  return chosen?.mode === "off" ? { times: [], clock: planner.settings.reminderClock } : chosen?.mode === "custom" ? { times: chosen.times, clock: chosen.clock } : { times: planner.settings.reminderTimes, clock: planner.settings.reminderClock };
}
/** Converts account or journey schedules to stable, deduplicated IST instants. */
export function scheduledReminders(planner:Planner, journey:Journey, now=new Date()) {
  if(journey.status === "cancellation_needed") {
    const pref=journey.cancellationReminder;
    if(!(pref?.enabled ?? planner.settings.cancellationEnabled)) return [];
    const schedule=pref ? pref.schedule : planner.settings.cancellationSchedule;
    return schedule ? scheduleInstants(journey.date,schedule) : [`${todayIST(now)}T${pref?.time ?? planner.settings.cancellationTime}:00+05:30`];
  }
  const routine=planner.rules.find(r=>r.id===journey.ruleId)?.reminderOverride;
  const chosen=journey.reminderOverride?.mode!=="inherit"&&journey.reminderOverride ? journey.reminderOverride : routine?.mode!=="inherit" ? routine : undefined;
  if(chosen?.mode==="off") return [];
  const defaults=journey.tatkalClass==="non_ac" ? planner.settings.tatkalNonAcSchedule ?? DEFAULT_TATKAL_SCHEDULE.map(row=>row.daysBefore ? row : {...row,time:row.time.replace("09:","10:")}) : planner.settings.tatkalSchedule ?? DEFAULT_TATKAL_SCHEDULE;
  const schedule=chosen?.mode==="custom" ? chosen.schedule : journey.bookingType==="tatkal" ? defaults : planner.settings.bookingSchedule;
  if(schedule) return scheduleInstants(bookingDay(journey),schedule);
  const pref=effectiveReminders(planner,journey);return reminderPreview(journey,pref.times,pref.clock);
}
/** Sorts and deduplicates explicitly configured days and delivery clocks. */
export function scheduleInstants(day:string,schedule:ReminderSchedule) { return [...new Set(schedule.map(r=>`${addDays(day,-r.daysBefore)}T${r.time}:00+05:30`))].sort(); }
/** Normalizes supported backup and stored workspace formats without discarding retained history. */
export function migratePlanner(value: unknown): Planner {
  if (!value || typeof value !== "object") return plannerSchema.parse(value);
  const raw = value as Record<string, unknown>;
  // Preserve legacy holiday records while removing the retired category from the UI.
  const holidays = Array.isArray(raw.holidays) ? raw.holidays.map(h => h && typeof h === "object" && h.type === "public" ? { ...h, type: "company" } : h) : raw.holidays;
  const planner = plannerSchema.parse({ ...raw, holidays });
  planner.journeys = planner.journeys.map(j => ({ ...j, originOffset: 0, bookingDateOverride: undefined, windowDays: j.status === "needs_booking" ? planner.settings.bookingWindowDays : j.windowDays, trainName: j.trainName ?? j.train, trainNumber: j.trainNumber ?? "" }));
  for (const rule of [...planner.rules]) {
    if (rule.returnAfterDays === null) continue;
    const offset = rule.returnAfterDays;
    const returnId = `${rule.id}:linked-return`;
    const returnRule: Rule = { ...rule, id: returnId, name: `${rule.name} · return`, from: rule.to, to: rule.from, start: addDays(rule.start, offset), end: rule.end ? addDays(rule.end, offset) : null, weekdays: rule.weekdays.map(d => (d + offset) % 7), departure: rule.returnDeparture, excludedDates: rule.excludedDates.map(d => addDays(d, offset)), returnAfterDays: null, linkedRuleId: rule.id };
    planner.rules = planner.rules.map(r => r.id === rule.id ? { ...r, returnAfterDays: null, linkedRuleId: returnId } : r);
    if (!planner.rules.some(r => r.id === returnId)) planner.rules.push(returnRule);
    planner.journeys = planner.journeys.map(j => j.ruleId === rule.id && j.leg === "return" ? { ...j, ruleId: returnId, id: `${returnId}:${j.date}:outbound` } : j);
  }
  return planner;
}
/** Derives the cancellation status appropriate for the current ticket state. */
export function cancellationStatus(status: JourneyStatus): JourneyStatus { return status === "booked" ? "cancellation_needed" : "skipped"; }
export type Break = { start: string; end: string; days: number; names: string[]; planBy: string; bookingAlreadyOpen: boolean };
/** Combines holidays, personal leave, and regular days off into travel opportunities. */
export function findBreaks(planner: Planner, today: string): Break[] {
  const result: Break[] = [];
  const holidayMap = new Map<string, Holiday[]>();
  for (const h of planner.holidays) holidayMap.set(h.date, [...(holidayMap.get(h.date) ?? []), h]);
  const /** Checks whether a date is covered by the configured time off. */ off = (d: string) => planner.settings.weekendDays.includes(weekday(d)) || holidayMap.has(d);
  const horizon = addDays(today, 365);
  for (let d = today; d <= horizon; d = addDays(d, 1)) {
    if (!off(d)) continue;
    let start = d;
    // Include an already-started break, with a bound for users who mark every day off.
    for (let n = 0; n < 14 && off(addDays(start, -1)); n++) start = addDays(start, -1);
    let end = d;
    while (daysBetween(start, end) < 31 && off(addDays(end, 1))) end = addDays(end, 1);
    const names: string[] = [];
    for (let x = start; x <= end; x = addDays(x, 1)) for (const h of holidayMap.get(x) ?? []) if (!names.includes(h.name)) names.push(h.name);
    const days = daysBetween(start, end) + 1;
    if (days >= 3 && names.length) result.push({ start, end, days, names, planBy: addDays(start, -planner.settings.bookingWindowDays), bookingAlreadyOpen: addDays(start, -planner.settings.bookingWindowDays) <= today });
    d = end;
  }
  return result;
}
// Strict CSV, including quoted commas; an invalid row rejects the entire import.
/** Validates imported holiday rows and generates account-local identifiers. */
export function parseHolidayCSV(text: string): Omit<Holiday, "id">[] {
  const rows: string[][] = []; let row: string[] = []; let field = ""; let quoted = false;
  const source = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (char === '"') { if (quoted && source[i + 1] === '"') { field += '"'; i++; } else quoted = !quoted; }
    else if (!quoted && (char === "," || char === "\n")) { row.push(field.trim()); field = ""; if (char === "\n") { if (row.some(Boolean)) rows.push(row); row = []; } }
    else if (char !== "\r" || quoted) field += char;
  }
  if (quoted) throw new Error("An imported CSV field has an unclosed quote.");
  row.push(field.trim()); if (row.some(Boolean)) rows.push(row);
  const headers = rows.shift()?.map(x => x.toLowerCase());
  if (!headers || headers.join(",") !== "date,name,type") throw new Error("CSV columns must be date,name,type in that order.");
  if (!rows.length || rows.length > 3000) throw new Error("Import between 1 and 3,000 holidays.");
  return rows.map((values, index) => {
    const parsed = holidaySchema.safeParse({ id: "import", date: values[0], name: values[1], type: values[2] || "company" });
    if (values.length !== 3 || !parsed.success) throw new Error(`Check CSV row ${index + 2}: use YYYY-MM-DD,name,company (or leave).`);
    return { date: parsed.data.date, name: parsed.data.name, type: parsed.data.type };
  });
}
/** Calculates scheduled reminder instants using the configured IST clock times. */
export function reminderPreview(journey: Journey, times: Planner["settings"]["reminderTimes"], reminderClock = DEFAULT_CLOCK) {
  const day = bookingDay(journey);
  return times.map(t => `${t === "previous_evening" ? addDays(day, -1) : day}T${reminderClock[t]}:00+05:30`);
}
/** Exports journey, booking, and time-off events as an iCalendar document. */
export function calendarFile(planner: Planner) {
  const /** Escapes special characters in iCalendar text. */ escape = (s: string) => s.replace(/\\/g, "\\\\").replace(/\r?\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
  const /** Formats a calendar date and time for export. */ stamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const events: string[] = []; const now = stamp(new Date());
  for (const j of planner.journeys.filter(j => !j.archivedAt && !["skipped", "cancelled", "completed"].includes(j.status))) {
    const description = escape(`${j.from} → ${j.to}. ${j.train || "Train not selected"}. ${j.status.replaceAll("_", " ")}. ${j.notes}`);
    const /** Builds an iCalendar event from its typed properties. */ event = (kind: string, title: string, start: Date, end: Date, alarms: string[] = []) => events.push(["BEGIN:VEVENT", `UID:${escape(j.id)}-${kind}@railwatch.local`, `DTSTAMP:${now}`, `SUMMARY:${escape(title)}`, `DESCRIPTION:${description}`, `DTSTART:${stamp(start)}`, `DTEND:${stamp(end)}`, ...alarms, "END:VEVENT"].join("\r\n"));
    const title = `${j.status === "cancellation_needed" ? "Cancel ticket: " : "Train: "}${j.from} → ${j.to}`;
    if (j.departureConfirmed) {
      const departure = new Date(`${j.date}T${j.departure}:00+05:30`);
      event("journey", title, departure, new Date(departure.getTime() + 3600000));
    } else events.push(["BEGIN:VEVENT", `UID:${escape(j.id)}-journey@railwatch.local`, `DTSTAMP:${now}`, `SUMMARY:${escape(title)}`, `DESCRIPTION:${description}`, `DTSTART;VALUE=DATE:${j.date.replaceAll("-", "")}`, `DTEND;VALUE=DATE:${addDays(j.date, 1).replaceAll("-", "")}`, "END:VEVENT"].join("\r\n"));
    if (j.status === "needs_booking") {
      const opens = bookingInstant(j);
      const alarms = scheduledReminders(planner,j).flatMap(time => ["BEGIN:VALARM", "ACTION:DISPLAY", "DESCRIPTION:Train booking reminder", `TRIGGER;VALUE=DATE-TIME:${stamp(new Date(time))}`, "END:VALARM"]);
      event("booking", `Book train: ${j.from} → ${j.to} (${formatDay(j.date)})`, opens, new Date(opens.getTime() + 900000), alarms);
    }
  }
  for (const h of planner.holidays) events.push(["BEGIN:VEVENT", `UID:${escape(h.id)}@railwatch.local`, `DTSTAMP:${now}`, `SUMMARY:${escape(h.name)}`, `DTSTART;VALUE=DATE:${h.date.replaceAll("-", "")}`, `DTEND;VALUE=DATE:${addDays(h.date, 1).replaceAll("-", "")}`, "END:VEVENT"].join("\r\n"));
  // Fold UTF-8 lines at 75 octets as required by iCalendar.
  const /** Folds calendar export lines to the iCalendar byte limit. */ fold = (line: string) => { let out = ""; let size = 0; for (const c of line) { const length = new TextEncoder().encode(c).length; if (size + length > 75) { out += "\r\n "; size = 1; } out += c; size += length; } return out; };
  return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//RailWatch//Travel planner//EN", "CALSCALE:GREGORIAN", ...events, "END:VCALENDAR", ""].join("\r\n").split("\r\n").map(fold).join("\r\n");
}
