"use client";
import { useState } from "react";
import { ArrowRight, CalendarDays } from "lucide-react";
import { formatDay, type Journey, type Planner } from "@/lib/travel-planner";
import { stationLabel } from "@/lib/journey-display";
import { timeOffGroups } from "@/lib/journey-display";
import { ActionMenu } from "./action-menu";
import s from "./time-off-overview.module.css";

type Break = { start: string; end: string; days: number; names: string[]; planBy: string; bookingAlreadyOpen: boolean };
/** Presents upcoming leave first, retaining past records and individual-day actions. */
export function TimeOffOverview({ holidays, today, breaks, remove, plan, journeys = [], skip, open }: {
  holidays: Planner["holidays"]; today: string; breaks: Break[];
  remove: (id: string) => void; plan: (date: string) => void;
  journeys?: Journey[]; skip?: (journey: Journey) => void; open?: (journey: Journey) => void;
}) {
  const [past, setPast] = useState(false), [kept, setKept] = useState<string[]>([]);
  // Plan 2.7: trips that fall on time off, and the count per time-off range.
  const active = journeys.filter(j => !j.archivedAt && ["needs_booking", "booked"].includes(j.status));
  const tripsIn = (start: string, end: string) => active.filter(j => j.date >= start && j.date <= end);
  const offDays = new Set(holidays.filter(h => h.date >= today).map(h => h.date));
  const affected = active.filter(j => j.date >= today && offDays.has(j.date) && !kept.includes(j.id)).sort((a, b) => a.date.localeCompare(b.date));
  const upcomingBreaks = breaks.filter(b => b.start >= today);
  const groups = timeOffGroups(holidays, today, past);
  const date = (value: string) => formatDay(value, { day: "numeric", month: "short", year: "numeric" });
  return <div className={s.layout}>
    <section aria-label="Your time off">
      <div className={s.heading}><h2>Your time off</h2><div className={s.filters} role="group" aria-label="Time off period">
        <button type="button" aria-pressed={!past} onClick={() => setPast(false)}>Upcoming</button>
        <button type="button" aria-pressed={past} onClick={() => setPast(true)}>Past</button>
      </div></div>
      <div className={s.list}>{groups.map(group => <details className={s.range} key={`${group.type}-${group.name}-${group.start}`}>
        <summary><span className={s.date} aria-hidden="true"><b>{formatDay(group.start, { day: "2-digit" })}</b><span>{formatDay(group.start, { month: "short" })}</span></span>
          <span className={s.description}><strong>{group.name}</strong><span>{date(group.start)}{group.end !== group.start ? ` – ${date(group.end)}` : ""}</span></span>
          <span className={s.kind}>{group.type === "company" ? "Company" : "Personal"}{group.days.length > 1 ? ` · ${group.days.length} days` : ""}</span>
          {group.start <= today && group.end >= today && <span className={s.pill}>In progress</span>}
          {!past && (() => { const n = tripsIn(group.start, group.end).length; return <span className={n ? s.pillWarn : s.pill}>{n ? `${n} ${n === 1 ? "trip" : "trips"} affected` : "No trips affected"}</span>; })()}
        </summary>
        <div className={s.days}>{group.days.map(day => <div className={s.day} key={day.id}><span>{date(day.date)}</span><ActionMenu label={`Actions For ${day.name} on ${day.date}`} actions={[{ label: "Remove time off", danger: true, onClick: () => remove(day.id) }]} /></div>)}</div>
      </details>)}{!groups.length && <div className={s.empty}><CalendarDays size={24} aria-hidden="true"/><strong>{past ? "No past time off" : "No upcoming time off"}</strong><p>{past ? "Past holidays and leave will appear here." : "Add time off or import company holidays to plan your next break."}</p></div>}</div>
      {!past && affected.length > 0 && <section className={s.affected} aria-labelledby="time-off-affected"><h2 id="time-off-affected">Trips during your time off</h2>
        {affected.map(j => <div key={j.id} className={s.affectedRow}><button type="button" className={s.affectedTrip} onClick={() => open?.(j)}>{formatDay(j.date, { weekday: "short", day: "numeric", month: "short" })} · {stationLabel(j.from)} → {stationLabel(j.to)}<small>{j.status === "booked" ? "Booked" : "Planned"}</small></button>
          {skip && j.status === "needs_booking" && <button type="button" className={s.skip} onClick={() => skip(j)}>Skip it</button>}
          <button type="button" className={s.keep} onClick={() => setKept([...kept, j.id])}>Keep</button></div>)}
      </section>}
    </section>
    <aside aria-label="Long weekends"><div className={s.heading}><h2>Long weekends ahead</h2></div><div className={s.list}>
      {upcomingBreaks.map(item => <article className={s.opportunity} key={item.start}><div><strong>{item.names.join(" + ")}</strong><span>{date(item.start)} – {date(item.end)}</span><span>{item.bookingAlreadyOpen ? "Booking is open" : `Booking opens ${date(item.planBy)} · 8 AM IST`}</span></div><span className={s.duration}>{item.days} days off</span><button type="button" onClick={() => plan(item.start)} aria-label={`Plan a journey for ${item.names.join(" + ")}`} >Plan a journey <ArrowRight size={16}/></button></article>)}
      {!upcomingBreaks.length && <p className={s.empty}>No upcoming long weekends in your current time off.</p>}
    </div></aside>
  </div>;
}
