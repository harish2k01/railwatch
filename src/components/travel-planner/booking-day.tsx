"use client";
import { useEffect, useState, useSyncExternalStore } from "react";
import { bookingDay, bookingInstant, formatDay, type Journey, type TicketAttachment } from "@/lib/travel-planner";
import { stationLabel } from "@/lib/journey-display";
import { saveTicketFile, validateTicketFile } from "@/lib/ticket-files";
import { useStationName } from "./journey-detail";
import s from "./planner.module.css";
import b from "./booking-day.module.css";

const ITEMS = ["Signed in to IRCTC", "Passenger saved in IRCTC master list", "Payment method ready", "Train and class chosen"];
const key = (id: string) => `railwatch:booking-checklist:${id}`;
/** Reads the per-device checklist; storage may be unavailable, which leaves every item unticked. */
const readChecklist = (id: string): boolean[] => { try { const v = JSON.parse(localStorage.getItem(key(id)) ?? "[]"); return Array.isArray(v) ? v.map(Boolean) : []; } catch { return []; } };
const noop = () => () => {};
const ist = (d: Date) => new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "Asia/Kolkata" }).format(d);

/** Time left until booking opens: MM:SS under an hour, otherwise HH:MM:SS; null once open. */
export function countdown(ms: number) { if (ms <= 0) return null; const t = Math.floor(ms / 1000), h = Math.floor(t / 3600), m = Math.floor(t / 60) % 60, sec = t % 60; return (h ? [h, m, sec] : [m, sec]).map((n) => String(n).padStart(2, "0")).join(":"); }

/** Booking day (plan 3.4, canvas BookingDay.dc.html): countdown, checklist on this device, IRCTC, and the outcome. */
export function BookingDay({ journey: j, routine, booked, retryTatkal, skip, fail }: { journey: Journey; routine?: string; booked: (status: "CNF" | "RAC" | "WL", ticket?: TicketAttachment) => void; retryTatkal?: () => void; skip: () => void; fail?: (message: string) => void }) {
  const opens = bookingInstant(j), [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const stored = useSyncExternalStore(noop, () => JSON.stringify(readChecklist(j.id)), () => "[]");
  const [checks, setChecks] = useState<boolean[] | null>(null), [result, setResult] = useState<"CNF" | "RAC" | "WL">("CNF"), [file, setFile] = useState<File>(), [busy, setBusy] = useState(false);
  const ticked = checks ?? (JSON.parse(stored) as boolean[]);
  const toggle = (i: number) => { const next = ITEMS.map((_, k) => k === i ? !ticked[k] : Boolean(ticked[k])); setChecks(next); try { localStorage.setItem(key(j.id), JSON.stringify(next)); } catch { /* device only */ } };
  const left = countdown(opens.getTime() - now), from = useStationName(j.from), to = useStationName(j.to);
  // The Tatkal opening for the same trip: the day before travel, 10:00 (AC) or 11:00 (non-AC).
  const tatkal = { ...j, bookingType: "tatkal" as const, tatkalClass: j.tatkalClass ?? "ac", trainOriginDate: j.trainOriginDate ?? j.date };
  async function markBooked() {
    let ticket: TicketAttachment | undefined;
    if (file) { setBusy(true); try { ticket = validateTicketFile(file); await saveTicketFile(ticket.id, file); } catch (e) { fail?.(e instanceof Error ? e.message : "Couldn’t store the ticket."); setBusy(false); return; } setBusy(false); }
    booked(result, ticket);
  }
  return <div className={b.day}>
    <section className={b.hero} aria-labelledby="booking-day-title">
      <div className={b.heroText}>
        <span className={b.kicker}>Booking day · {j.bookingType === "tatkal" ? `Tatkal ${j.tatkalClass === "non_ac" ? "non-AC" : "AC"}` : "Normal quota"}</span>
        <h2 id="booking-day-title">{stationLabel(j.from)} → {stationLabel(j.to)} · {formatDay(j.date, { weekday: "short", day: "numeric", month: "short", year: "numeric" })}</h2>
        <span className={b.sub}>{[from && to ? `${from} to ${to}` : "", routine].filter(Boolean).join(" · ")}</span>
      </div>
      <div aria-live="polite" className={b.timer}>{left ? <><small>Opens at {ist(opens)} IST in</small><b>{left}</b></> : <><small>Opened at {ist(opens)} IST</small><b>Open now</b></>}</div>
    </section>
    <div className={b.cards}>
      <section className={b.card} aria-labelledby="booking-ready"><h3 id="booking-ready">Get ready</h3>
        {ITEMS.map((label, i) => <label key={label} className={b.check}><input type="checkbox" checked={Boolean(ticked[i])} onChange={() => toggle(i)} />{label}</label>)}
        <a className={`${s.primary} ${b.irctc}`} href="https://www.irctc.co.in/nget/train-search" target="_blank" rel="noreferrer">Open IRCTC ↗</a>
        <small className={b.muted}>RailWatch never books for you or stores IRCTC credentials.</small>
      </section>
      <section className={b.card} aria-labelledby="booking-outcome"><h3 id="booking-outcome">How did it go?</h3>
        <div className={b.outcomes} role="radiogroup" aria-label="Booking result">
          {([["CNF", "Confirmed", "CNF"], ["RAC", "RAC", "Seat shared"], ["WL", "Waitlist", "WL"]] as const).map(([v, label, sub]) => <button key={v} type="button" role="radio" aria-checked={result === v} className={b.outcome} onClick={() => setResult(v)}>{label}<small>{sub}</small></button>)}
        </div>
        <label className={b.drop}><input type="file" accept="application/pdf" onChange={e => setFile(e.target.files?.[0])} /><b>{file ? file.name : "Drop the e-ticket PDF"}</b><small>PNR, train, coach and berth are filled in from it.</small></label>
        <button type="button" className={s.primary} disabled={busy} onClick={() => void markBooked()}>{busy ? "Saving…" : "Mark booked"}</button>
        <hr className={b.rule} />
        <b className={b.didnt}>Didn’t get it?</b>
        <div className={b.retry}>{retryTatkal && j.bookingType !== "tatkal" && <button type="button" className={s.secondary} onClick={retryTatkal}>Try Tatkal · {formatDay(bookingDay(tatkal), { weekday: "short", day: "numeric", month: "short" })}, {ist(bookingInstant(tatkal))}</button>}<button type="button" className={s.secondary} onClick={skip}>Skip this trip</button></div>
      </section>
    </div>
  </div>;
}
