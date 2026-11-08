"use client";
import { useState, useSyncExternalStore } from "react";
import { addDays, bookingDay, bookingTimeLabel, formatDay, ruleSchema, todayIST, weekday, type Planner, type Rule } from "@/lib/travel-planner";
import { PwaInstall } from "../pwa-install";
import { BrowserPush } from "../browser-push";
import { StationInput } from "./station-input";
import s from "./first-run.module.css";

const KEY = "railwatch:first-run-dismissed";
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const ORDER = [1, 2, 3, 4, 5, 6, 0];
const noop = () => () => {};
/** Reads a per-browser flag; storage can be unavailable (private mode), so failures mean "not dismissed". */
const readDismissed = () => { try { return localStorage.getItem(KEY) === "1"; } catch { return false; } };
const dismiss = () => { try { localStorage.setItem(KEY, "1"); } catch { /* per-browser only */ } };

/** First journey date on or after today that falls on one of the weekdays. */
function nextOn(days: number[], today: string) { for (let i = 0; i < 14; i++) { const d = addDays(today, i); if (days.includes(weekday(d))) return d; } return ""; }

/** A weekly routine as the regular-trip step creates it. */
function weekly(planner: Planner, from: string, to: string, days: number[], name: string, start: string, linkedRuleId?: string): Rule {
  return ruleSchema.parse({ id: crypto.randomUUID(), name, from, to, start, end: null, weekdays: days, intervalWeeks: 1, recurrence: { frequency: "weekly", interval: 1, monthlyPattern: "date", dayOfMonth: Number(start.slice(-2)), ordinal: 1, weekday: weekday(start) }, timePreference: "any", departure: "20:00", train: "", travelClass: "", windowDays: planner.settings.bookingWindowDays, originOffset: 0, returnAfterDays: null, returnDeparture: "20:00", returnTrain: "", returnOriginOffset: 0, linkedRuleId, excludedDates: [], paused: false });
}

/**
 * First run (plan 2.9, canvas Onboarding.dc.html): regular trip → holidays and leave → reminders → install.
 * Opens on its own for a new, empty workspace unless dismissed in this browser; automated browsers skip the
 * automatic opening so scripted checks start on Today.
 */
export function FirstRun({ planner, empty, onClose, saveRoutine, importHolidays, addTimeOff, reminders, enableEmail, email }: {
  planner: Planner; empty: boolean; onClose?: () => void; email?: string;
  saveRoutine: (rule: Rule) => Promise<boolean>; importHolidays: () => void; addTimeOff: () => void; reminders: () => void; enableEmail?: () => Promise<boolean>;
}) {
  const dismissed = useSyncExternalStore(noop, readDismissed, () => true);
  const automated = useSyncExternalStore(noop, () => Boolean((navigator as Navigator & { webdriver?: boolean }).webdriver), () => true);
  const [note, setNote] = useState(""), [closed, setClosed] = useState(false), [step, setStep] = useState(0), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [from, setFrom] = useState(""), [to, setTo] = useState(""), [going, setGoing] = useState<number[]>([]), [back, setBack] = useState<number[]>([]);
  const open = !closed && empty && !dismissed && !automated;
  if (!open) return null;
  const close = () => { dismiss(); setClosed(true); onClose?.(); };
  const today = todayIST(), first = going.length ? nextOn(going, today) : "";
  const preview = first ? { date: first, windowDays: planner.settings.bookingWindowDays, originOffset: 0 } : undefined;
  const steps = ["Regular trip", "Holidays and leave", "Reminders", "Install app"];
  async function continueTrip() {
    if (!going.length && !back.length) { setStep(1); return; }
    if (!from.trim() || !to.trim()) { setError("Choose both stations, or skip this step."); return; }
    setBusy(true); setError("");
    try {
      const out = weekly(planner, from.trim(), to.trim(), going.length ? going : back, `${from.trim()} → ${to.trim()}`, today);
      if (!(await saveRoutine(out))) return;
      if (going.length && back.length && !(await saveRoutine(weekly(planner, to.trim(), from.trim(), back, `${to.trim()} → ${from.trim()}`, today, out.id)))) return;
      setStep(1);
    } catch { setError("Check the stations and days."); } finally { setBusy(false); }
  }
  const dayButtons = (value: number[], set: (v: number[]) => void, label: string) => <fieldset className={s.days}><legend>{label}</legend><div>{ORDER.map(d => <button key={d} type="button" className={s.day} aria-pressed={value.includes(d)} onClick={() => set(value.includes(d) ? value.filter(x => x !== d) : [...value, d])}>{DAYS[d]}</button>)}</div></fieldset>;
  return <div className={s.screen} role="dialog" aria-modal="true" aria-labelledby="first-run-title">
    <div className={s.inner}>
      <ol className={s.steps} aria-label="Setup steps">{steps.map((label, i) => <li key={label} aria-current={i === step ? "step" : undefined} data-done={i < step || undefined}><span>{i + 1}</span>{label}</li>)}</ol>
      {step === 0 && <><div className={s.head}><h1 id="first-run-title">Do you travel the same route often?</h1><p>RailWatch plans those journeys for you and reminds you before each booking window opens.</p></div>
        <form className={s.card} onSubmit={e => { e.preventDefault(); void continueTrip(); }} onInput={e => { const f = e.currentTarget.elements.namedItem("from") as HTMLInputElement | null, t = e.currentTarget.elements.namedItem("to") as HTMLInputElement | null; if (f) setFrom(f.value); if (t) setTo(t.value); }}>
          <div className={s.route}><label className={s.label}>From<StationInput recent={[]} name="from" className={s.input} placeholder="Station code or name" /></label><label className={s.label}>To<StationInput recent={[]} name="to" className={s.input} placeholder="Station code or name" /></label></div>
          {dayButtons(going, setGoing, "Going on")}
          {dayButtons(back, setBack, "Coming back on")}
          <div className={s.window}>{preview ? <>Next booking window: <strong>{formatDay(bookingDay(preview), { weekday: "short", day: "numeric", month: "short" })} at {bookingTimeLabel(preview).replace(" IST", "")}</strong> for {formatDay(first, { weekday: "short", day: "numeric", month: "short" })}.</> : "Pick the days you travel to see the next booking window."}</div>
          {error && <p role="alert" className={s.error}>{error}</p>}
        </form>
        <div className={s.footer}><button type="button" className={s.ghost} onClick={close}>Skip, I’ll plan trips one by one</button><button type="button" className={s.primary} disabled={busy} onClick={() => void continueTrip()}>{busy ? "Saving…" : "Continue"}</button></div></>}
      {step === 1 && <><div className={s.head}><h1 id="first-run-title">Add your holidays and leave</h1><p>Routines can skip these days, and long weekends show up as trip ideas.</p></div>
        <div className={s.card}><button type="button" className={s.option} onClick={importHolidays}><b>Import company holidays</b><small>A CSV or calendar (.ics) file from Google or Outlook</small></button><button type="button" className={s.option} onClick={addTimeOff}><b>Add time off</b><small>A holiday or a few days of leave</small></button></div>
        <div className={s.footer}><button type="button" className={s.ghost} onClick={() => setStep(0)}>Back</button><button type="button" className={s.primary} onClick={() => setStep(2)}>Continue</button></div></>}
      {step === 2 && <><div className={s.head}><h1 id="first-run-title">How should we remind you?</h1><p>Reminders arrive the evening before and on the morning booking opens. Choose email, Telegram or this device.</p></div>
        <div className={s.card}>
          <div className={s.channel}><span><b>This device</b><small>A notification on this phone or computer. Works when RailWatch is installed or open in the browser.</small></span><BrowserPush notice={setNote} fail={setError} /></div>
          {enableEmail && <div className={s.channel}><span><b>Email</b><small>{planner.settings.emailEnabled ? `On${email ? ` · ${email}` : ""}.` : `To ${email || "your account email"}. Verify the address in Settings if you haven’t yet.`}</small></span>{planner.settings.emailEnabled ? <span className={s.on}>On</span> : <button type="button" className={s.ghost} disabled={busy} onClick={async () => { setBusy(true); setError(""); try { if (await enableEmail()) setNote("Email reminders are on."); } finally { setBusy(false); } }}>Turn on</button>}</div>}
          <div className={s.channel}><span><b>Telegram</b><small>{planner.settings.telegramEnabled ? "Connected." : "A message from the RailWatch bot. Connect it from Settings."}</small></span><button type="button" className={s.ghost} onClick={reminders}>{planner.settings.telegramEnabled ? "Settings" : "Connect"}</button></div>
        </div>
        {note && <p role="status" className={s.note}>{note}</p>}{error && step === 2 && <p role="alert" className={s.error}>{error}</p>}
        <div className={s.footer}><button type="button" className={s.ghost} onClick={() => setStep(1)}>Back</button><button type="button" className={s.primary} onClick={() => setStep(3)}>Continue</button></div></>}
      {step === 3 && <><div className={s.head}><h1 id="first-run-title">Install RailWatch</h1><p>Open it from your home screen or dock, like any other app.</p></div>
        <div className={s.card}><div className={s.install}><PwaInstall /></div></div>
        <div className={s.footer}><button type="button" className={s.ghost} onClick={() => setStep(2)}>Back</button><button type="button" className={s.primary} onClick={close}>Finish</button></div></>}
    </div>
  </div>;
}
