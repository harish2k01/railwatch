"use client";

import { AlertTriangle, CalendarPlus, CheckCheck, Plus, Ticket } from "lucide-react";
import { addDays, bookingDay, bookingTimeLabel, calendarFile, daysBetween, formatDay, type Journey, type Planner } from "@/lib/travel-planner";
import type { DashboardView } from "@/lib/planning-views";
import { stationLabel } from "@/lib/journey-display";
import { useStationName } from "./journey-detail";

import { STATUS } from "./forms";
import s from "./planner.module.css";
import t from "./today.module.css";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const every = (days: number[]) => days.length === 7 ? "Every day" : `Every ${days.map(d => DAYS[d]).join(", ")}`;
const dayName = (date: string, today: string) => date === today ? "today" : date === addDays(today, 1) ? "tomorrow" : formatDay(date, { weekday: "long" });
const time = (j: Journey) => bookingTimeLabel(j).replace(" IST", "");

/** A route code with its station name underneath (canvas: Today · Next trip). */
function Stop({ code }: { code: string }) {
  const name = useStationName(code);
  return <span className={t.stop}><b title={code}>{stationLabel(code)}</b>{name && <small>{name}</small>}</span>;
}

/** Saves one journey as a calendar file (canvas: Add to calendar). */
function addToCalendar(planner: Planner, j: Journey) {
  const blob = new Blob([calendarFile({ ...planner, journeys: [j], holidays: [] })], { type: "text/calendar;charset=utf-8" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `railwatch-${j.from}-${j.to}-${j.date}.ics`; a.click(); URL.revokeObjectURL(a.href);
}

type Props = {
  planner: Planner; today: string; data: DashboardView; openJourney: (j: Journey) => void; createJourney: () => void;
  go: (tab: "journeys" | "calendar" | "routines" | "holidays", status?: Journey["status"]) => void; chooseDate: (date: string) => void;
  setStatus?: (j: Journey, status: Journey["status"]) => void; skipTimeOff?: (j: Journey) => void; keepTimeOff?: (j: Journey) => void;
  openBookingDay?: (j: Journey) => void; importTickets?: () => void; attachTicket?: (j: Journey) => void; remind?: (j: Journey) => void;
};

/** Today (plan 2.3, canvas Main.dc.html): next trip, Do next, this week, the routine and time off. */
export function Dashboard({ planner, today, data, openJourney, createJourney, go, chooseDate, setStatus, skipTimeOff, keepTimeOff, openBookingDay, importTickets, attachTicket, remind }: Props) {
  const { upcoming, bookingSoon, totals, week } = data;
  const next = upcoming.find(j => j.status === "booked") ?? upcoming[0];
  const holidays = planner.holidays.filter(h => h.date >= today).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 3);
  const routine = planner.rules.find(r => !r.paused), linked = routine?.linkedRuleId ? planner.rules.find(r => r.id === routine.linkedRuleId) : undefined;
  const missing = totals.noTicket ?? 0;
  const reminding = (j: Journey) => j.reminderOverride?.mode === "custom" && j.reminderOverride.times.includes("opening");
  // Do next: what needs doing now, then missing tickets and the next booking openings (canvas order).
  const items: { key: string; node: React.ReactNode }[] = [
    ...data.attention.map(j => ({ key: "a" + j.id, node: <div className={t.row} data-attention>
      <button type="button" className={`${s.dashboardRow} ${t.rowMain}`} onClick={() => openJourney(j)}><span className={j.status === "cancellation_needed" ? t.tileCancel : t.tileOpen}><b>{j.date.slice(-2)}</b><small>{formatDay(j.date, { month: "short" })}</small></span><span className={t.rowText}><b>{j.status === "cancellation_needed" ? "Cancellation to confirm" : "Booking is open"}</b><small>{stationLabel(j.from)} → {stationLabel(j.to)} · travel {formatDay(j.date, { weekday: "short", day: "numeric", month: "short", year: "numeric" })}</small></span></button>
      <span className={t.rowActions}>{setStatus && (j.status === "cancellation_needed"
        ? <button type="button" className={s.secondary} onClick={() => { if (confirm("Have you cancelled this ticket through IRCTC?")) setStatus(j, "cancelled"); }}>Confirm cancellation</button>
        : <button type="button" className={s.secondary} onClick={() => setStatus(j, "booked")}>Mark booked</button>)}</span>
    </div> })),
    ...(missing > 0 && importTickets ? [{ key: "tickets", node: <div className={t.row}>
      <span className={`${t.rowMain} ${t.rowStatic}`}><span className={t.tileTicket} aria-hidden="true"><Ticket size={22} /></span><span className={t.rowText}><b>{missing} booked {missing === 1 ? "journey has" : "journeys have"} no ticket</b><small>Drop the IRCTC PDFs in one go. Details are read on your device.</small></span></span>
      <span className={t.rowActions}><button type="button" className={s.secondary} onClick={importTickets}>Attach tickets</button></span>
    </div> }] : []),
    ...bookingSoon.slice(0, 3).map(j => ({ key: "b" + j.id, node: <div className={t.row}>
      <button type="button" className={t.rowMain} onClick={() => openJourney(j)}><span className={t.tileOpen}><b>{bookingDay(j).slice(-2)}</b><small>{formatDay(bookingDay(j), { month: "short" })}</small></span><span className={t.rowText}><b>Booking opens {dayName(bookingDay(j), today)}, {time(j)}</b><small>{stationLabel(j.from)} → {stationLabel(j.to)} · travel {formatDay(j.date, { weekday: "short", day: "numeric", month: "short", year: "numeric" })} · {j.bookingType === "tatkal" ? "Tatkal" : "Normal quota"}</small></span></button>
      <span className={t.rowActions}>{remind && <button type="button" className={s.secondary} aria-pressed={reminding(j)} onClick={() => remind(j)}>{reminding(j) ? "Reminder set" : `Remind ${planner.settings.reminderClock?.opening ?? "07:55"}`}</button>}{bookingDay(j) <= addDays(today, 1) && openBookingDay && <button type="button" className={s.secondary} onClick={() => openBookingDay(j)}>Booking day</button>}{bookingDay(j) <= addDays(today, 1) && setStatus && <button type="button" className={s.secondary} onClick={() => setStatus(j, "booked")}>Mark booked</button>}</span>
    </div> })),
  ];
  return <div className={t.today}>
    {(data.conflicts?.length ?? 0) > 0 && <section className={t.decision} aria-labelledby="today-decision"><h2 id="today-decision">Needs a decision</h2>
      {data.conflicts.map(j => <div key={j.id} className={t.decisionLine}><button type="button" className={t.decisionTrip} onClick={() => openJourney(j)}><b>{formatDay(j.date, { weekday: "short", day: "numeric", month: "short" })} · {stationLabel(j.from)} → {stationLabel(j.to)}</b><small>{STATUS[j.status]} on your time off{j.ruleId ? " · from a routine" : ""}</small></button>{skipTimeOff && <button type="button" className={s.primary} onClick={() => skipTimeOff(j)}>Skip this trip</button>}{keepTimeOff && <button type="button" className={s.secondary} onClick={() => keepTimeOff(j)}>Keep</button>}</div>)}
    </section>}
    <div className={t.grid}>
      <div className={t.column}>
        {next ? <section className={t.card} aria-labelledby="today-next">
          <header className={t.cardHead}><h2 id="today-next" className={t.eyebrow}>Next trip · {daysBetween(today, next.date) === 0 ? "today" : `in ${daysBetween(today, next.date)} day${daysBetween(today, next.date) === 1 ? "" : "s"}`}</h2><span className={`${t.pill} ${next.status === "booked" ? t.pillBooked : t.pillPlanned}`}><i aria-hidden="true" />{STATUS[next.status]}</span></header>
          <div className={t.route}><Stop code={next.from} /><span aria-hidden="true" className={t.track} /><Stop code={next.to} /><span className={t.when}><b>{formatDay(next.date, { weekday: "short", day: "numeric", month: "short" })}</b><small>{[planner.rules.find(r => r.id === next.ruleId)?.name, next.leg === "return" ? "Return" : next.ruleId ? "Onward" : "", next.departureConfirmed && next.departure ? `${next.departure} IST` : ""].filter(Boolean).join(" · ") || "One-off trip"}</small></span></div>
          {next.status === "booked" && !next.attachments?.length && <div className={t.nudge}><AlertTriangle size={20} aria-hidden="true" /><span>No ticket attached. Add it now so the train, coach and PNR are here on the day.</span>{attachTicket && <button type="button" className={s.primary} onClick={() => attachTicket(next)}>Attach ticket</button>}</div>}
          <div className={t.actions}><button type="button" className={s.secondary} onClick={() => openJourney(next)}>Open journey</button><button type="button" className={s.secondary} onClick={() => addToCalendar(planner, next)}><CalendarPlus size={16} />Add to calendar</button></div>
        </section> : <section className={t.card}><div className={s.dashboardEmpty}><CheckCheck size={26} /><h3>No trips coming up</h3><p>Add a journey or routine to see your next trip here.</p><button className={s.textButton} onClick={createJourney}><Plus size={15} />Plan a journey</button></div></section>}

        <section className={t.section} aria-labelledby="today-do-next">
          <header className={t.sectionHead}><h2 id="today-do-next">Do next</h2><span className={t.muted}>{items.length} {items.length === 1 ? "item" : "items"}</span></header>
          {items.length ? <div className={t.list}>{items.map(i => <div key={i.key}>{i.node}</div>)}</div> : <p className={t.muted}>You’re all caught up. Nothing needs booking or cancelling right now.</p>}
        </section>
      </div>

      <aside className={t.column} aria-label="This week and plans">
        <section className={t.card} aria-labelledby="today-week">
          <header className={t.cardHead}><h2 id="today-week">This week</h2><button type="button" className={t.link} onClick={() => go("calendar")}>Calendar</button></header>
          <ul className={t.week}>{Array.from({ length: 7 }, (_, i) => {
            const date = addDays(today, i), day = week[date], off = planner.holidays.filter(h => h.date === date);
            const parts = [...off.map(h => h.type === "company" ? `${h.name} · company holiday` : h.name), day?.journeys ? (day.journeys === 1 ? "1 journey" : `${day.journeys} journeys`) : "", day?.bookings ? "booking opens" : "", day?.cancellations ? `${day.cancellations} to cancel` : ""].filter(Boolean);
            const dot = day?.journeys ? t.dotBooked : day?.bookings ? t.dotOpen : off.length ? t.dotOff : undefined;
            const text = parts.join(" · ");
            return <li key={date} data-today={i === 0 || undefined}><button type="button" onClick={() => chooseDate(date)} aria-label={`View ${formatDay(date, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}`}><span className={t.weekDay}>{i === 0 ? "Today" : formatDay(date, { weekday: "short", day: "numeric" })}</span><span className={text ? undefined : t.muted}>{text ? text[0].toUpperCase() + text.slice(1) : "Nothing planned"}</span>{dot && <i className={dot} aria-hidden="true" />}</button></li>;
          })}</ul>
        </section>

        {routine && <section className={t.card} aria-labelledby="today-routine">
          <header className={t.cardHead}><h2 id="today-routine">{routine.name}</h2><button type="button" className={t.link} onClick={() => go("routines")}>Routines</button></header>
          {[routine, linked].filter((r): r is NonNullable<typeof r> => Boolean(r)).map(r => <div key={r.id} className={t.line}><span>{stationLabel(r.from)} → {stationLabel(r.to)}</span><span className={t.muted}>{every(r.weekdays)}</span></div>)}
          <hr className={t.rule} />
          <span className={t.muted}>{totals.upcoming} upcoming · {totals.booked} booked</span>
        </section>}

        <section className={t.card} aria-labelledby="today-off">
          <header className={t.cardHead}><h2 id="today-off">Coming up off</h2><button type="button" className={t.link} onClick={() => go("holidays")}>Time off</button></header>
          {holidays.length ? holidays.map(h => <div key={h.id} className={t.line}><span>{h.name}</span><span className={t.muted}>{formatDay(h.date, { weekday: "short", day: "numeric", month: "short" })}</span></div>) : <p className={t.muted}>Add company holidays or leave to plan around them.</p>}
        </section>
      </aside>
    </div>
  </div>;
}
