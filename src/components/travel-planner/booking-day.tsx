"use client";
import { useEffect, useState, useSyncExternalStore } from "react";
import { ExternalLink } from "lucide-react";
import { bookingInstant, formatDay, type Journey } from "@/lib/travel-planner";
import { stationLabel } from "@/lib/journey-display";
import s from "./planner.module.css";
import b from "./booking-day.module.css";

const ITEMS = ["Signed in to IRCTC", "Passenger saved in IRCTC master list", "Payment method ready", "Train and class chosen"];
const key = (id: string) => `railwatch:booking-checklist:${id}`;
/** Reads the per-device checklist; storage may be unavailable, which leaves every item unticked. */
const readChecklist = (id: string): boolean[] => { try { const v = JSON.parse(localStorage.getItem(key(id)) ?? "[]"); return Array.isArray(v) ? v.map(Boolean) : []; } catch { return []; } };
const noop = () => () => {};

/** Formats the time left until booking opens as HH:MM:SS, or null once it has opened. */
export function countdown(ms: number) { if (ms <= 0) return null; const t = Math.floor(ms / 1000); return [Math.floor(t / 3600), Math.floor(t / 60) % 60, t % 60].map((n) => String(n).padStart(2, "0")).join(":"); }

/** Booking day mode (plan 3.4): IST countdown, a checklist kept on this device, Open IRCTC and the outcome. */
export function BookingDay({ journey: j, booked, retryTatkal, skip }: { journey: Journey; booked: (status: "CNF" | "RAC" | "WL") => void; retryTatkal?: () => void; skip: () => void }) {
  const opens = bookingInstant(j), [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const stored = useSyncExternalStore(noop, () => JSON.stringify(readChecklist(j.id)), () => "[]");
  const [checks, setChecks] = useState<boolean[] | null>(null);
  const ticked = checks ?? (JSON.parse(stored) as boolean[]);
  const toggle = (i: number) => { const next = ITEMS.map((_, k) => k === i ? !ticked[k] : Boolean(ticked[k])); setChecks(next); try { localStorage.setItem(key(j.id), JSON.stringify(next)); } catch { /* device only */ } };
  const left = countdown(opens.getTime() - now);
  return <div className={b.day}>
    <section className={b.hero} aria-labelledby="booking-day-title">
      <span className={b.kicker}>Booking day · {j.bookingType === "tatkal" ? "Tatkal" : "Normal quota"}</span>
      <h2 id="booking-day-title">{stationLabel(j.from)} → {stationLabel(j.to)} · {formatDay(j.date, { weekday: "short", day: "numeric", month: "short", year: "numeric" })}</h2>
      <div aria-live="polite" className={b.timer}>{left ? <><small>Opens at {new Intl.DateTimeFormat("en-IN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" }).format(opens)} IST in</small><b>{left}</b></> : <b>Booking is open</b>}</div>
    </section>
    <section aria-labelledby="booking-ready"><h3 id="booking-ready">Get ready</h3>
      {ITEMS.map((label, i) => <label key={label} className={b.check}><input type="checkbox" checked={Boolean(ticked[i])} onChange={() => toggle(i)} />{label}</label>)}
      <a className={`${s.primary} ${b.irctc}`} href="https://www.irctc.co.in/nget/train-search" target="_blank" rel="noreferrer">Open IRCTC <ExternalLink size={16} /></a>
      <p className={s.help}>RailWatch never books for you or stores IRCTC credentials. This checklist stays on this device.</p>
    </section>
    <section aria-labelledby="booking-outcome"><h3 id="booking-outcome">How did it go?</h3>
      <div className={b.outcomes} role="group" aria-label="Booking result">
        <button type="button" className={s.secondary} onClick={() => booked("CNF")}>Confirmed</button>
        <button type="button" className={s.secondary} onClick={() => booked("RAC")}>RAC</button>
        <button type="button" className={s.secondary} onClick={() => booked("WL")}>Waitlisted</button>
      </div>
      <p className={s.help}>Didn’t get it?</p>
      <div className={b.outcomes}>{retryTatkal && j.bookingType !== "tatkal" && <button type="button" className={s.secondary} onClick={retryTatkal}>Try Tatkal</button>}<button type="button" className={s.secondary} onClick={skip}>Skip this trip</button></div>
    </section>
  </div>;
}
