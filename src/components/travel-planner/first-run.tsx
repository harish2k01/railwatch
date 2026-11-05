"use client";
import { useState, useSyncExternalStore } from "react";
import { CalendarDays, Check, Repeat2, Bell, Smartphone, X } from "lucide-react";
import s from "./first-run.module.css";

const KEY = "railwatch:first-run-dismissed";
/** Reads a per-browser flag; storage can be unavailable (private mode), so failures mean "not dismissed". */
const noop = () => () => {};
const readDismissed = () => { try { return localStorage.getItem(KEY) === "1"; } catch { return false; } };

/** First-run checklist for a new, empty workspace (plan 2.9): regular trip, time off, reminders, install. */
export function FirstRun({ hasRoutine, hasTimeOff, routine, timeOff, reminders }: { hasRoutine: boolean; hasTimeOff: boolean; routine: () => void; timeOff: () => void; reminders: () => void }) {
  // Server render and hydration assume dismissed, so the card never flashes before storage is read.
  const stored = useSyncExternalStore(noop, readDismissed, () => true), [closed, setClosed] = useState(false);
  if (stored || closed) return null;
  const close = () => { setClosed(true); try { localStorage.setItem(KEY, "1"); } catch { /* per-browser only */ } };
  const steps = [
    { done: hasRoutine, icon: Repeat2, title: "Add your regular trip", hint: "RailWatch plans those journeys and reminds you before each booking window opens.", action: <button type="button" onClick={routine}>Set up a routine</button> },
    { done: hasTimeOff, icon: CalendarDays, title: "Add holidays and leave", hint: "Routines skip these days, and long weekends show up as trip ideas.", action: <button type="button" onClick={timeOff}>Import holidays</button> },
    { done: false, icon: Bell, title: "Choose your reminders", hint: "Email, Telegram or device notifications, at times that suit you.", action: <button type="button" onClick={reminders}>Reminder settings</button> },
    { done: false, icon: Smartphone, title: "Install the app", hint: "Use Install RailWatch in the sidebar (or More on a phone) to open it from your home screen.", action: null },
  ];
  return <section className={s.card} aria-labelledby="first-run">
    <header><h2 id="first-run">Get set up</h2><button type="button" className={s.close} aria-label="Dismiss setup" onClick={close}><X size={18} /></button></header>
    <ol className={s.steps}>{steps.map((st, i) => <li key={st.title} data-done={st.done || undefined}>
      <span className={s.num} aria-hidden="true">{st.done ? <Check size={14} strokeWidth={3} /> : i + 1}</span>
      <span className={s.text}><b>{st.title}</b><small>{st.hint}</small></span>
      {!st.done && <span className={s.action}>{st.action}</span>}
    </li>)}</ol>
    <button type="button" className={s.skip} onClick={close}>Skip, I’ll plan trips one by one</button>
  </section>;
}
