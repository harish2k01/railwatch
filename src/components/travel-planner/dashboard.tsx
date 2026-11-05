"use client";

import { ArrowRight, CheckCheck, Paperclip, Plus } from "lucide-react";
import { addDays, bookingDay, bookingTimeLabel, daysBetween, formatDay, type Journey, type Planner } from "@/lib/travel-planner";
import type { DashboardView } from "@/lib/planning-views";
import { stationLabel } from "@/lib/journey-display";

import { STATUS } from "./forms";
import s from "./planner.module.css";
import t from "./today.module.css";
import { useStationName } from "./journey-detail";

/** Route codes with their station names underneath (canvas: Today · Next trip). */
function NextRoute({ from, to }: { from: string; to: string }) {
  const a = useStationName(from), b = useStationName(to);
  return <div className={t.route}><span className={t.stop}><b title={from}>{stationLabel(from)}</b>{a && <small>{a}</small>}</span><span aria-hidden="true" className={t.track} /><span className={t.stop}><b title={to}>{stationLabel(to)}</b>{b && <small>{b}</small>}</span></div>;
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const weekdayList = (days: number[]) => days.length === 7 ? "Every day" : `Every ${days.map((d) => DAYS[d]).join(", ")}`;

/** Today page (plan 2.3): next trip, what to do next, the week ahead, routines and time off. */
export function Dashboard({ planner, today, data, openJourney, createJourney, go, chooseDate, setStatus, skipTimeOff, keepTimeOff, openBookingDay, importTickets }: { planner: Planner; today: string; data: DashboardView; openJourney: (j: Journey) => void; createJourney: () => void; go: (tab: "journeys" | "calendar" | "routines" | "holidays", status?: Journey["status"]) => void; chooseDate: (date: string) => void; setStatus?: (j: Journey, status: Journey["status"]) => void; skipTimeOff?: (j: Journey) => void; keepTimeOff?: (j: Journey) => void; openBookingDay?: (j: Journey) => void; importTickets?: () => void }) {
  const { upcoming, bookingSoon, totals, week } = data;
  const next = upcoming[0];
  const holidays = planner.holidays.filter((h) => h.date >= today).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 3);
  const routines = planner.rules.filter((r) => !r.paused).slice(0, 2);
  // Only non-zero counts are shown (plan 2.3: hide zero counts).
  const counts = [
    { label: "Ready to book", value: totals.ready, status: "needs_booking" as const },
    { label: "Tickets to cancel", value: totals.toCancel, status: "cancellation_needed" as const },
    { label: "Tickets booked", value: totals.booked, status: "booked" as const },
  ].filter((c) => c.value > 0);
  return <div className={t.today}>
    {counts.length > 0 && <div className={t.counts} aria-label="Journey counts">{counts.map((c) => <button key={c.label} type="button" className={t.count} onClick={() => go("journeys", c.status)}>{c.label} <strong>{c.value}</strong></button>)}</div>}
    <div className={t.grid}>
      <div className={t.column}>
        {next ? <section className={t.card} aria-labelledby="today-next">
          <header className={t.cardHead}><h2 id="today-next">Next trip · {daysBetween(today, next.date) === 0 ? "today" : `in ${daysBetween(today, next.date)} day${daysBetween(today, next.date) === 1 ? "" : "s"}`}</h2><span className={`${s.badge} ${next.status === "booked" ? s.badgeGreen : next.status === "cancellation_needed" ? s.badgeAmber : s.badgePurple}`}>{STATUS[next.status]}</span></header>
          <NextRoute from={next.from} to={next.to} />
          <p className={t.muted}>{formatDay(next.date, { weekday: "short", day: "numeric", month: "short" })}{next.departureConfirmed && next.departure ? ` · ${next.departure} IST` : ""}{planner.rules.find((r) => r.id === next.ruleId)?.name ? ` · ${planner.rules.find((r) => r.id === next.ruleId)!.name}` : ""}</p>
          {next.status === "booked" && !next.attachments?.length && <div className={t.nudge}><span>No ticket attached. Add it now so the train, coach and PNR are here on the day.</span><button type="button" className={s.secondary} onClick={() => openJourney(next)}><Paperclip size={15} />Attach ticket</button></div>}
          <div className={t.actions}><button type="button" className={s.primary} onClick={() => openJourney(next)}>Open journey</button></div>
        </section> : <section className={t.card}><div className={s.dashboardEmpty}><CheckCheck size={26} /><h3>No trips coming up</h3><p>Add a journey or routine to see your next trip here.</p><button className={s.textButton} onClick={createJourney}><Plus size={15} />Plan a journey</button></div></section>}

        {(data.conflicts?.length ?? 0) > 0 && <section className={t.decision} aria-labelledby="today-decision"><h2 id="today-decision">Needs a decision</h2>
          {data.conflicts.map((j) => <div key={j.id} className={t.item}><button type="button" className={t.itemMain + " " + t.decisionTrip} onClick={() => openJourney(j)}><b>{formatDay(j.date, { weekday: "short", day: "numeric", month: "short" })} · {stationLabel(j.from)} → {stationLabel(j.to)}</b><small>{STATUS[j.status]} on your time off{j.ruleId ? " · from a routine" : ""}</small></button>{skipTimeOff && <button type="button" className={s.primary} onClick={() => skipTimeOff(j)}>Skip this trip</button>}{keepTimeOff && <button type="button" className={s.secondary} onClick={() => keepTimeOff(j)}>Keep</button>}</div>)}
        </section>}
        <section className={t.section}>
          <header className={t.sectionHead}><h2>Do next{totals.attention > 0 && <> <span>{totals.attention}</span></>}</h2>{totals.attention > data.attention.length && <button className={s.textButton} onClick={() => go("journeys")}>View all <ArrowRight size={15} /></button>}</header>
          {(() => { const soon = bookingSoon.filter(j => bookingDay(j) <= addDays(today, 1)); const missing = totals.noTicket ?? 0; return (soon.length > 0 || missing > 0) && <div className={t.list}>
            {soon.map(j => <div key={"soon" + j.id} className={t.item}><button type="button" className={`${s.dashboardRow} ${t.itemMain}`} onClick={() => openJourney(j)}><span className={s.dateTile}><b>{bookingDay(j).slice(-2)}</b><small>{formatDay(bookingDay(j), { month: "short" })}</small></span><div><b>Booking opens {bookingDay(j) === today ? "today" : "tomorrow"}, {bookingTimeLabel(j)}</b><small>{stationLabel(j.from)} → {stationLabel(j.to)} · travel {formatDay(j.date, { weekday: "short", day: "numeric", month: "short" })}</small></div></button>{openBookingDay && <button type="button" className={s.secondary} onClick={() => openBookingDay(j)}>Booking day</button>}</div>)}
            {missing > 0 && importTickets && <div className={t.item}><div className={`${s.dashboardRow} ${t.itemMain}`}><span className={s.dateTile}><b>{missing}</b><small>trips</small></span><div><b>{missing} booked {missing === 1 ? "journey has" : "journeys have"} no ticket</b><small>Add the IRCTC PDFs in one go. Details are read on your device.</small></div></div><button type="button" className={s.secondary} onClick={importTickets}>Attach tickets</button></div>}
          </div>; })()}
          {data.attention.length ? <div className={t.list}>{data.attention.map((j) => <div key={j.id} className={t.item}>
            <button type="button" className={`${s.dashboardRow} ${t.itemMain}`} onClick={() => openJourney(j)}><span className={s.dateTile}><b>{j.date.slice(-2)}</b><small>{formatDay(j.date, { month: "short" })}</small></span><div><b>{stationLabel(j.from)} <ArrowRight size={13} /> {stationLabel(j.to)}</b><small>{j.status === "cancellation_needed" ? "Cancellation to confirm" : "Booking is open"}</small></div></button>
            {setStatus && (j.status === "cancellation_needed"
              ? <button type="button" className={s.secondary} onClick={() => { if (confirm("Have you cancelled this ticket through IRCTC?")) setStatus(j, "cancelled"); }}>Confirm cancellation</button>
              : <button type="button" className={s.secondary} onClick={() => setStatus(j, "booked")}>Mark booked</button>)}
          </div>)}</div> : <p className={t.muted}>You’re all caught up. Nothing needs booking or cancelling right now.</p>}
        </section>

        <section className={t.section}>
          <header className={t.sectionHead}><h2>Upcoming journeys</h2></header>
          {upcoming.length ? <div className={t.list}>{upcoming.slice(0, 4).map((j) => <button key={j.id} type="button" className={s.dashboardRow} onClick={() => openJourney(j)}><span className={s.dateTile}><b>{j.date.slice(-2)}</b><small>{formatDay(j.date, { month: "short" })}</small></span><div><b>{stationLabel(j.from)} <ArrowRight size={13} /> {stationLabel(j.to)}</b><small>{formatDay(j.date, { weekday: "long" })} · {STATUS[j.status]}</small></div></button>)}</div> : <p className={t.muted}>Your upcoming journeys will appear here.</p>}
        </section>
      </div>

      <div className={t.column}>
        <section className={t.card} aria-labelledby="today-openings">
          <header className={t.cardHead}><h2 id="today-openings">Next booking openings</h2></header>
          {bookingSoon.length ? <div className={t.list}>{bookingSoon.slice(0, 4).map((j) => <button key={j.id} type="button" className={s.dashboardRow} onClick={() => openJourney(j)}><span className={s.dateTile}><b>{bookingDay(j).slice(-2)}</b><small>{formatDay(bookingDay(j), { month: "short" })}</small></span><div><b>{stationLabel(j.from)} <ArrowRight size={13} /> {stationLabel(j.to)}</b><small>Opens {bookingTimeLabel(j)} · travel {formatDay(j.date, { day: "numeric", month: "short" })}</small></div></button>)}</div> : <p className={t.muted}>No booking openings coming up.</p>}
        </section>

        <section className={t.card} aria-labelledby="today-week">
          <header className={t.cardHead}><h2 id="today-week">This week</h2><button className={s.textButton} onClick={() => go("calendar")}>Calendar <ArrowRight size={15} /></button></header>
          <ul className={t.week}>{Array.from({ length: 7 }, (_, i) => {
            const date = addDays(today, i), day = week[date], off = planner.holidays.filter((h) => h.date === date);
            const parts = [...off.map((h) => h.name), day?.journeys ? `${day.journeys} ${day.journeys === 1 ? "journey" : "journeys"}` : "", day?.bookings ? "Booking opens" : "", day?.cancellations ? `${day.cancellations} to cancel` : ""].filter(Boolean);
            return <li key={date}><button type="button" onClick={() => chooseDate(date)} aria-label={`View ${formatDay(date, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}`}><span className={i === 0 ? t.todayLabel : t.muted}>{i === 0 ? "Today" : formatDay(date, { weekday: "short", day: "numeric" })}</span><span className={parts.length ? undefined : t.muted}>{parts.join(" · ") || "Nothing planned"}</span></button></li>;
          })}</ul>
        </section>

        {routines.length > 0 && <section className={t.card} aria-labelledby="today-routines">
          <header className={t.cardHead}><h2 id="today-routines">{routines.length === 1 ? routines[0].name : "Routines"}</h2><button className={s.textButton} onClick={() => go("routines")}>Manage <ArrowRight size={15} /></button></header>
          {routines.map((r) => <div key={r.id} className={t.line}><span>{stationLabel(r.from)} → {stationLabel(r.to)}</span><span className={t.muted}>{weekdayList(r.weekdays)}</span></div>)}
        </section>}

        <section className={t.card} aria-labelledby="today-off">
          <header className={t.cardHead}><h2 id="today-off">Coming up off</h2><button className={s.textButton} onClick={() => go("holidays")}>Time off <ArrowRight size={15} /></button></header>
          {holidays.length ? holidays.map((h) => <div key={h.id} className={t.line}><span>{h.name}</span><span className={t.muted}>{formatDay(h.date, { weekday: "short", day: "numeric", month: "short" })}</span></div>) : <p className={t.muted}>Add company holidays or leave to plan around them.</p>}
        </section>
      </div>
    </div>
  </div>;
}
