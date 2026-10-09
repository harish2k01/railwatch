"use client";

import { useRef, useState, type FormEvent } from "react";
import { ArrowRight, Bell, Link2 } from "lucide-react";
import { addDays, bookingDay, bookingTimeLabel, DEFAULT_TATKAL_SCHEDULE, type ReminderSchedule, formatDay, DEFAULT_CLOCK, journeySchema, REMINDER_KEYS, ruleSchema, type Journey, type Planner, type ReminderOverride, type Rule } from "@/lib/travel-planner";
import { Select } from "./select";
import s from "./planner.module.css";
import { weekday, type TicketAttachment } from "@/lib/travel-planner";
import { TicketViewer } from "./ticket-viewer";
import { ActionMenu } from "./action-menu";
import { deleteTicketFile, downloadTicketFile, extractTicketFile, saveTicketFile, validateTicketFile } from "@/lib/ticket-files";
import type { TicketDetails } from "@/lib/ticket-details";

export const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const STATUS = { needs_booking: "To Book", booked: "Booked", skipped: "Skipped", cancellation_needed: "To Cancel", cancelled: "Cancelled", completed: "Completed" };
export const TIME_LABELS = { any: "Any time", morning: "Morning", afternoon: "Afternoon", evening: "Evening", night: "Night" };
export const REMINDER_LABELS = { previous_evening: "The evening before", morning: "On booking day", opening: "Near booking opening" };

export {Field,Modal} from "./form-ui";
import {Field} from "./form-ui";
/** Edits the selected reminder moments and their IST delivery times. */
export function ReminderTimes({ times, clock }: { times: Planner["settings"]["reminderTimes"]; clock: Planner["settings"]["reminderClock"] }) {
  return <div className={s.reminderTimes}>{REMINDER_KEYS.map(key => <div key={key}><label className={s.check}><input name="reminderTimes" type="checkbox" value={key} defaultChecked={times.includes(key)} />{REMINDER_LABELS[key]}</label><input aria-label={`${REMINDER_LABELS[key]} time`} type="time" name={`clock_${key}`} defaultValue={clock[key]} required /></div>)}</div>;
}
/** Edits any number of reminder days and IST clocks, including opening-day alerts. */
export function ScheduleFields({initial,prefix="custom",anchor="booking opens"}:{initial:ReminderSchedule;prefix?:string;anchor?:string}) {
 const [rows,setRows]=useState(initial.map((row,index)=>({...row,id:index})));const next=useRef(initial.length);
 /** Marks structural schedule edits for parent unsaved-change guards. */
 function editRows(button:HTMLButtonElement,nextRows:typeof rows){button.dispatchEvent(new Event("input",{bubbles:true}));setRows(nextRows);}

 return <div className={s.scheduleRows}><input type="hidden" name={`${prefix}_present`} value="yes"/><p className={s.help}>Days before {anchor}. Use 0 for the same day. Times are IST.</p>{rows.map(row=><div className={s.scheduleRow} key={row.id}><Field label="Days before"><input type="number" name={`${prefix}_days`} min={0} max={365} value={row.daysBefore} required onChange={e=>setRows(rows.map(r=>r.id===row.id?{...r,daysBefore:Number(e.target.value)}:r))}/></Field><Field label="Time (IST)"><input type="time" name={`${prefix}_time`} value={row.time} required onChange={e=>setRows(rows.map(r=>r.id===row.id?{...r,time:e.target.value}:r))}/></Field><button type="button" className={s.secondary} aria-label={`Remove reminder ${row.id+1}`} onClick={e=>editRows(e.currentTarget,rows.filter(r=>r.id!==row.id))}>Remove</button></div>)}<button type="button" className={s.secondary} disabled={rows.length>=20} onClick={e=>editRows(e.currentTarget,[...rows,{id:next.current++,daysBefore:0,time:"07:55"}])}>Add reminder</button>{!rows.length&&<small>No reminders scheduled.</small>}</div>;
}
/** Reads paired schedule rows in DOM order, preserving an explicitly empty schedule. */
export function scheduleFromForm(form:FormData,prefix="custom"):ReminderSchedule|undefined {
 if(!form.has(`${prefix}_present`))return undefined;
 const times=form.getAll(`${prefix}_time`);return form.getAll(`${prefix}_days`).map((day,i)=>({daysBefore:Number(day),time:String(times[i])}));
}
/** Converts the three historical reminder choices without changing their times. */
export function legacySchedule(times:Planner["settings"]["reminderTimes"],clock:Planner["settings"]["reminderClock"]):ReminderSchedule { return times.map(key=>({daysBefore:key==="previous_evening"?1:0,time:clock[key]})); }
/** Chooses daily cancellation follow-ups or an explicit schedule before travel. */
export function CancellationFields({enabled,time,schedule}:{enabled:boolean;time:string;schedule?:ReminderSchedule}) {
 const [mode,setMode]=useState(schedule?"custom":"daily");
 return <section className={s.formSection}><h3>Cancellation Reminders</h3><label className={s.check}><input type="checkbox" name="cancellationEnabled" defaultChecked={enabled}/>Remind me while cancellation is pending</label><Field label="Reminder schedule"><Select name="cancellationMode" value={mode} onChange={e=>setMode(e.target.value)}><option value="daily">Every day until cancelled or travel date passes</option><option value="custom">Choose days before travel</option></Select></Field>{mode==="daily"?<Field label="Daily reminder time (IST)"><input type="time" name="cancellationTime" defaultValue={time} required/></Field>:<ScheduleFields initial={schedule??[{daysBefore:1,time:"09:00"}]} prefix="cancel" anchor="travel"/>}</section>;
}
/** Selects inherited, disabled, or custom reminder behavior for a routine or journey. */
export function ReminderFields({ initial, settings, routine = false,enabled=true }: { enabled?:boolean;initial?: ReminderOverride; settings: Planner["settings"]; routine?: boolean }) {
  const [mode, setMode] = useState(initial?.mode ?? "inherit");
  if(!enabled)return null;
  return <section className={s.formSection}><h3><Bell size={16} /> Booking Reminders</h3><Field label="Reminder Preference"><Select name="reminderMode" value={mode} onChange={e => setMode(e.target.value as ReminderOverride["mode"])}><option value="inherit">{routine ? "Use default reminders" : "Use routine / default reminders"}</option><option value="off">No reminders for this {routine ? "routine" : "journey"}</option><option value="custom">Customize reminders</option></Select></Field>{mode === "custom" && <ScheduleFields initial={initial?.schedule ?? settings.bookingSchedule ?? legacySchedule(initial?.times ?? settings.reminderTimes,initial?.clock ?? settings.reminderClock)} />}</section>;
}
/** Parses reminder controls into the persisted override structure. */
export function remindersFromForm(form: FormData): ReminderOverride {
  return { schedule:scheduleFromForm(form),mode: String(form.get("reminderMode") ?? "inherit") as ReminderOverride["mode"], times: form.getAll("reminderTimes") as ReminderOverride["times"], clock: Object.fromEntries(REMINDER_KEYS.map(k => [k, String(form.get(`clock_${k}`) ?? DEFAULT_CLOCK[k])])) as ReminderOverride["clock"] };
}
/** Renders weekday selection using the instance-defined first day of the week. */
export function Weekdays({ name = "weekdays", selected = [], weekStartsOn=0 }: { name?: string; selected?: number[];weekStartsOn?:number }) {
  return <div className={s.weekdays}>{Array.from({length:7},(_,i)=>(i+weekStartsOn)%7).map(d => <label key={d}><input type="checkbox" name={name} value={d} defaultChecked={selected.includes(d)} /><span>{DAYS[d]}</span></label>)}</div>;
}

/** Validates recurrence inputs and preserves linked routine settings when saving. */
export function RuleForm({ rule, planner, today, save, fail,remindersEnabled=true }: { remindersEnabled?:boolean;rule?: Partial<Rule>; planner: Planner; today: string; save: (rule: Rule) => void; fail: (message: string) => void }) {
  const initial = rule?.recurrence;
  const [start, setStart] = useState(rule?.start ?? today);
  const [preset, setPreset] = useState(initial && initial.interval > 1 || !initial && (rule?.intervalWeeks ?? 1) > 1 ? "custom" : initial?.frequency === "monthly" ? `monthly_${initial.monthlyPattern}` : initial?.frequency ?? "weekly");
  const [unit, setUnit] = useState(initial?.frequency ?? "weekly");
  const frequency = preset === "custom" ? unit : preset.startsWith("monthly") ? "monthly" : preset;
    /** Validates the active form and submits its account-scoped changes. */
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); const form = new FormData(e.currentTarget); const /** Reads a form field as a string. */ str = (key: string) => String(form.get(key) ?? "");
    const selected = form.getAll("weekdays").map(Number);
    const interval = preset === "custom" ? Number(form.get("interval")) : 1;
    const result = ruleSchema.safeParse({ ...rule, id: rule?.id ?? crypto.randomUUID(), name: str("name"), from: str("from"), to: str("to"), start, end: str("end") || null, weekdays: frequency === "weekly" ? selected : [weekday(start)], intervalWeeks: Math.min(interval, 12), recurrence: { frequency, interval, monthlyPattern: str("monthlyPattern") || "date", dayOfMonth: Number(form.get("dayOfMonth") ?? start.slice(-2)), ordinal: Number(form.get("ordinal") ?? Math.ceil(Number(start.slice(-2)) / 7)), weekday: Number(form.get("monthlyWeekday") ?? weekday(start)) }, timePreference: "any", departure: "20:00", train: "", travelClass: "", windowDays: planner.settings.bookingWindowDays, originOffset: 0, returnAfterDays: null, returnDeparture: "20:00", returnTrain: "", returnOriginOffset: 0, linkedRuleId: str("linkedRuleId") || undefined, excludedDates: [], paused: rule?.paused ?? false, reminderOverride: remindersEnabled ? remindersFromForm(form) : rule?.reminderOverride });
    if (!result.success) { fail(frequency === "weekly" && !selected.length ? "Choose at least one travel day." : result.error.issues[0]?.message ?? "Check the routine fields."); return; }
    save(result.data);
  }
  return <form className={s.form} onSubmit={submit}>
    <Field label="Routine Name"><input name="name" maxLength={80} defaultValue={rule?.name} placeholder="Give this routine a name" required /></Field>
    <div className={s.formGrid}><Field label="From"><input name="from" defaultValue={rule?.from} maxLength={80} placeholder="Station or city" required /></Field><Field label="To"><input name="to" defaultValue={rule?.to} maxLength={80} placeholder="Station or city" required /></Field></div>
    <div className={s.formGrid}><Field label="Start Date"><input name="start" type="date" value={start} onChange={e => setStart(e.target.value)} required /></Field><Field label="End Date (Optional)" hint="Leave empty for an ongoing routine."><input name="end" type="date" defaultValue={rule?.end ?? ""} /></Field></div>
    <section className={s.formSection}><h3>Repeat This Journey</h3><Field label="Repeat Every"><Select value={preset} onChange={e => setPreset(e.target.value)}><option value="daily">Every day</option><option value="weekly">Every week on selected days</option><option value="monthly_date">Every month on a date</option><option value="monthly_weekday">Every month on a weekday</option><option value="yearly">Every year on the start date</option><option value="custom">Custom repeat…</option></Select></Field>
      {preset === "custom" && <div className={s.formGrid}><Field label="Repeat Interval"><input name="interval" type="number" min={1} max={365} defaultValue={initial?.interval ?? rule?.intervalWeeks ?? 1} required /></Field><Field label="Interval Unit"><Select value={unit} onChange={e => setUnit(e.target.value as typeof unit)}><option value="daily">Days</option><option value="weekly">Weeks</option><option value="monthly">Months</option><option value="yearly">Years</option></Select></Field></div>}
      {frequency === "weekly" && <fieldset><legend>Travel Days</legend><Weekdays weekStartsOn={planner.settings.weekStartsOn} selected={rule?.weekdays ?? [weekday(start)]} /></fieldset>}
      {frequency === "monthly" && <MonthlyPattern weekStartsOn={planner.settings.weekStartsOn} key={preset} customizable={preset === "custom"} pattern={preset === "monthly_weekday" ? "weekday" : preset === "monthly_date" ? "date" : initial?.monthlyPattern ?? "date"} start={start} initial={initial} />}
      {frequency === "yearly" && <p className={s.help}>Repeats on the month and day of your start date. February 29 repeats only in leap years.</p>}
      <p className={s.help}>{planner.settings.routineHorizonMode === "count" ? `Up to ${planner.settings.routineTicketCount} upcoming journeys per routine are created.` : `Journeys are created up to ${planner.settings.routineMonthsAhead} months from today.`} Months without your selected date or weekday are skipped.</p>
    </section>
    <section className={s.formSection}><h3><Link2 size={16} /> Onward And Return</h3><Field label="Link To Another Routine" hint="Each direction has its own recurrence and reminders."><Select name="linkedRuleId" defaultValue={rule?.linkedRuleId ?? ""}><option value="">Independent routine</option>{planner.rules.filter(r => r.id !== rule?.id).map(r => <option value={r.id} key={r.id}>{r.name} · {r.from} → {r.to}</option>)}</Select></Field></section>
    <ReminderFields initial={rule?.reminderOverride} settings={planner.settings} routine enabled={remindersEnabled} /><div className={s.formFooter}><button className={s.primary}>Save routine <ArrowRight size={16} /></button></div>
  </form>;
}

/** Edits monthly recurrence by date or weekday occurrence. */
function MonthlyPattern({ pattern, start, initial, customizable,weekStartsOn }: {weekStartsOn:number; pattern: string; start: string; initial?: Rule["recurrence"]; customizable: boolean }) {
  const [choice, setChoice] = useState(pattern);
  // Re-mount when switching the preset so the visible pattern matches it.
  return <div className={s.monthlyFields}>{customizable ? <Field label="Monthly Pattern"><Select name="monthlyPattern" value={choice} onChange={e => setChoice(e.target.value)}><option value="date">Day of the month</option><option value="weekday">Weekday of the month</option></Select></Field> : <input type="hidden" name="monthlyPattern" value={choice} />}{choice === "date" ? <Field label="Day Of The Month"><input name="dayOfMonth" type="number" min={1} max={31} defaultValue={initial?.dayOfMonth ?? Number(start.slice(-2))} required /></Field> : <div className={s.formGrid}><Field label="Week Of The Month"><Select name="ordinal" defaultValue={initial?.ordinal ?? Math.ceil(Number(start.slice(-2)) / 7)}>{[[1, "First"], [2, "Second"], [3, "Third"], [4, "Fourth"], [5, "Fifth"], [-1, "Last"]].map(([value, label]) => <option value={value} key={value}>{label}</option>)}</Select></Field><Field label="Weekday"><Select name="monthlyWeekday" defaultValue={initial?.weekday ?? weekday(start)}>{Array.from({length:7},(_,i)=>(i+weekStartsOn)%7).map(i => <option value={i} key={i}>{DAYS[i]}</option>)}</Select></Field></div>}</div>;
}

/** Edits journey status, booking dates, ticket details, and attachment suggestions. */
export function JourneyForm({ journey, date, planner, today, save, fail, ticket = false,remindersEnabled=true,uploadsEnabled=true }: { remindersEnabled?:boolean;uploadsEnabled?:boolean;journey?: Journey; date?: string; planner: Planner; today: string; save: (journey: Journey) => boolean | Promise<boolean>; fail: (message: string) => void; ticket?: boolean }) {
  const ref = useRef<HTMLFormElement>(null);
  const [status, setStatus] = useState<Journey["status"]>(ticket ? "booked" : journey?.status ?? "needs_booking");
  const [travelDate,setTravelDate]=useState(journey?.date ?? date ?? addDays(today,61));
  const [bookingType,setBookingType]=useState(journey?.bookingType??"normal"),[tatkalClass,setTatkalClass]=useState(journey?.tatkalClass??"ac"),[trainOriginDate,setTrainOriginDate]=useState(journey?.trainOriginDate??journey?.date??date??addDays(today,61));
  const bookingDate=bookingDay({date:travelDate||today,windowDays:planner.settings.bookingWindowDays,originOffset:0,bookingType,tatkalClass,trainOriginDate:trainOriginDate||travelDate});
  const [viewBlob,setViewBlob]=useState<Blob>();const [viewTicket,setViewTicket]=useState<TicketAttachment>();
  const [files, setFiles] = useState<TicketAttachment[]>(journey?.attachments ?? []);
  const staged = useRef(new Map<string, File>());
  const [busy, setBusy] = useState(false);
  const [detected, setDetected] = useState<TicketDetails>({});
  const [extraction, setExtraction] = useState("");
  const showTicket = status !== "needs_booking" && status !== "skipped" || Boolean(journey?.pnr || journey?.train || journey?.trainName || files.length);
    /** Stages an attachment and extracts reviewable ticket suggestions before saving. */
  async function upload(file?: File) {
    if (!file) return;
    try {
      if (file.type === "application/pdf" && files.length >= 20) throw new Error("Keep up to 20 attachments per journey.");
      const metadata = validateTicketFile(file);
      if(file.type==="application/pdf"){staged.current.set(metadata.id, file); setFiles(old => [...old, metadata]);} setBusy(true); setDetected({}); setExtraction("Reading your ticket…");
      try { const result = await extractTicketFile(file,setExtraction); setDetected(result.details); setExtraction(result.message); }
      catch { setExtraction("Could not read ticket details. Enter them manually below."); }
    } catch (e) { fail(e instanceof Error ? e.message : "Could not attach this file."); }
    finally { setBusy(false); }
  }
    /** Copies reviewed suggestions into ticket controls while preserving controlled travel-date state. */
  function applyDetails() {
    if(detected.date)setTravelDate(detected.date);
    for (const [key, value] of Object.entries(detected)) { const field = ref.current?.elements.namedItem(key); if (field instanceof HTMLInputElement || field instanceof HTMLSelectElement) {field.value = value;field.dispatchEvent(new Event("change",{bubbles:true}));} }
    setExtraction("Detected details applied. Review them before saving."); setDetected({});
  }
    /** Validates the active form and submits its account-scoped changes. */
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); if (busy) return; const form = new FormData(e.currentTarget); const /** Reads a form field as a string. */ str = (key: string) => String(form.get(key) ?? "").trim();
    if (str("from").toLowerCase() === str("to").toLowerCase()) { fail("Choose different departure and arrival stations."); return; }
    if(bookingType==="tatkal" && (!trainOriginDate || trainOriginDate>travelDate)){fail("The train must start on or before your travel date.");return;}
    const details = showTicket ? { trainName: str("trainName"), trainNumber: str("trainNumber"), train: str("trainName").slice(0, 80), travelClass: str("travelClass"), pnr: str("pnr"), coach: str("coach"), seat: str("seat"), berth: str("berth"), departure: str("departure") || "20:00", departureConfirmed: Boolean(str("departure")) } : { train: journey?.train ?? "", travelClass: journey?.travelClass ?? "", pnr: journey?.pnr ?? "", departure: journey?.departure ?? "20:00" };
    const result = journeySchema.safeParse({ ...journey, ...details, id: journey?.id ?? crypto.randomUUID(), from: str("from"), to: str("to"), date: travelDate, timePreference: "any", windowDays: planner.settings.bookingWindowDays, originOffset: 0, bookingDateOverride: undefined, bookingType,tatkalClass,trainOriginDate:bookingType==="tatkal"?trainOriginDate:undefined,cancellationReminder:remindersEnabled&&status==="cancellation_needed"?{enabled:form.has("cancellationEnabled"),time:str("cancellationTime")||planner.settings.cancellationTime,schedule:scheduleFromForm(form,"cancel")}:journey?.cancellationReminder, status, notes: str("notes"), attachments: files, reminderOverride: (remindersEnabled ? remindersFromForm(form) : journey?.reminderOverride), manualOverride: journey?.ruleId ? true : journey?.manualOverride });
    if (!result.success) { fail("Check the fields. PNR must be empty or exactly 10 digits."); return; }
    const stored: string[] = []; setBusy(true);
    try {
      for (const meta of files) { const file = staged.current.get(meta.id); if (file) { await saveTicketFile(meta.id, file); stored.push(meta.id); } }
      if (!await save(result.data)) { await Promise.all(stored.map(deleteTicketFile)); return; }
      const removed = (journey?.attachments ?? []).filter(old => !files.some(f => f.id === old.id));
      await Promise.all(removed.map(f => deleteTicketFile(f.id).catch(() => undefined)));
    } catch { await Promise.all(stored.map(id => deleteTicketFile(id).catch(() => undefined))); fail("Could not store the ticket files. Your journey has not been saved."); }
    finally { setBusy(false); }
  }
  return <form ref={ref} className={s.form} onSubmit={submit}>
    <div className={s.formGrid}><Field label="From"><input name="from" defaultValue={journey?.from} maxLength={80} placeholder="Station or city" required /></Field><Field label="To"><input name="to" defaultValue={journey?.to} maxLength={80} placeholder="Station or city" required /></Field></div>
    <div className={s.formGrid}><Field label="Travel Date"><input type="date" name="date" value={travelDate} onChange={e=>{if(trainOriginDate===travelDate)setTrainOriginDate(e.target.value);setTravelDate(e.target.value);}} required /></Field><Field label="Journey Status"><Select name="status" value={status} onChange={e => setStatus(e.target.value as Journey["status"])}>{Object.entries(STATUS).map(([id, label]) => <option value={id} key={id}>{label}</option>)}</Select></Field></div>
    {status === "needs_booking" && <><Field label="Booking type"><Select value={bookingType} onChange={e=>setBookingType(e.target.value as "normal"|"tatkal")}><option value="normal">Normal</option><option value="tatkal">Tatkal</option></Select></Field>{bookingType==="tatkal"&&<div className={s.formGrid}><Field label="Tatkal class"><Select value={tatkalClass} onChange={e=>setTatkalClass(e.target.value as "ac"|"non_ac")}><option value="ac">AC — opens at 10 AM</option><option value="non_ac">Non-AC — opens at 11 AM</option></Select></Field><Field label="Train starts from its origin on" hint="Use the train’s starting date, which can be earlier than your boarding date."><input type="date" value={trainOriginDate} max={travelDate} required onChange={e=>setTrainOriginDate(e.target.value)}/></Field></div>}<section className={s.bookingSummary}><b>Booking Opens</b><strong>{travelDate ? formatDay(bookingDate,{weekday:"long",day:"numeric",month:"long",year:"numeric"}) : "Choose a travel date"}</strong><span>{bookingTimeLabel({bookingType,tatkalClass})} · {bookingType==="tatkal"?"One day before the train starts":`${planner.settings.bookingWindowDays} days before travel`}</span></section></>}
    {showTicket && <section className={s.formSection}><h3>Ticket Details <span className={s.optional}>All optional</span></h3>{uploadsEnabled&&<Field label="Upload Ticket PDF Or QR Image" hint="PDFs are saved. Images and QR codes only extract details. Review suggestions before applying."><input type="file" accept="application/pdf,image/png,image/jpeg,image/webp" disabled={busy} onChange={e => { void upload(e.target.files?.[0]); e.target.value = ""; }} /></Field>}
      {viewTicket&&<TicketViewer file={viewTicket} blob={viewBlob} close={()=>setViewTicket(undefined)}/>}
      {files.map(file => <div className={s.fileRow} key={file.id}><span>Ticket PDF</span><button type="button" className={s.secondary} onClick={()=>{setViewBlob(staged.current.get(file.id));setViewTicket(file);}}>View Ticket</button><ActionMenu label="Ticket Attachment Actions" disabled={busy} actions={[{label:"Download Ticket",onClick:()=>void downloadTicketFile(file,staged.current.get(file.id)).catch(e=>fail(e.message))},{label:"Remove Ticket",danger:true,onClick:()=>{if(confirm("Remove this ticket file from the journey?")){staged.current.delete(file.id);setFiles(files.filter(f=>f.id!==file.id));}}}]}/></div>)}
      {extraction && <div className={s.extraction} role="status"><p>{extraction}</p>{Object.keys(detected).length > 0 && <><dl>{Object.entries(detected).map(([key, value]) => <div key={key}><dt>{key.replace(/([A-Z])/g, " $1")}</dt><dd>{value}</dd></div>)}</dl><button type="button" className={s.secondary} onClick={applyDetails}>Apply detected details</button></>}</div>}
      <div className={s.formGrid}><Field label="Train Number"><input name="trainNumber" maxLength={20} defaultValue={journey?.trainNumber} placeholder="e.g. 12637" /></Field><Field label="Train Name"><input name="trainName" maxLength={100} defaultValue={journey?.trainName ?? journey?.train} placeholder="Optional" /></Field><Field label="Travel Class"><Select name="travelClass" defaultValue={journey?.travelClass ?? ""}><option value="">Not recorded</option>{["SL", "3A", "2A", "1A", "3E", "CC", "EC", "2S"].map(c => <option key={c}>{c}</option>)}</Select></Field><Field label="PNR"><input name="pnr" inputMode="numeric" pattern="[0-9]{10}" maxLength={10} defaultValue={journey?.pnr} placeholder="Optional 10-digit PNR" /></Field><Field label="Coach"><input name="coach" maxLength={20} defaultValue={journey?.coach} placeholder="e.g. B1" /></Field><Field label="Seat Number"><input name="seat" maxLength={30} defaultValue={journey?.seat} placeholder="e.g. 42" /></Field><Field label="Berth"><input name="berth" maxLength={30} defaultValue={journey?.berth} placeholder="e.g. Lower / LB" /></Field><Field label="Departure Time (IST)"><input name="departure" type="time" defaultValue={journey?.departureConfirmed ? journey.departure : ""} /></Field></div>
    </section>}
    <Field label="Notes"><textarea name="notes" maxLength={1000} rows={2} defaultValue={journey?.notes} placeholder="Anything you want to remember" /></Field>{remindersEnabled&&(status==="cancellation_needed"?<CancellationFields enabled={journey?.cancellationReminder?.enabled??planner.settings.cancellationEnabled} time={journey?.cancellationReminder?.time??planner.settings.cancellationTime} schedule={journey?.cancellationReminder?.schedule??planner.settings.cancellationSchedule}/>:<ReminderFields key={`${bookingType}-${tatkalClass}`} initial={journey?.reminderOverride} settings={bookingType==="tatkal"?{...planner.settings,bookingSchedule:tatkalClass==="non_ac"?planner.settings.tatkalNonAcSchedule??DEFAULT_TATKAL_SCHEDULE.map(row=>row.daysBefore?row:{...row,time:row.time.replace("09:","10:")}):planner.settings.tatkalSchedule??DEFAULT_TATKAL_SCHEDULE}:planner.settings} enabled={remindersEnabled} />)}
    <div className={s.formFooter}><span className={s.help}>Status changes update your records. Book and cancel through IRCTC.</span><button className={s.primary} disabled={busy}>{busy ? "Working…" : "Save journey"}<ArrowRight size={16} /></button></div>
  </form>;
}
