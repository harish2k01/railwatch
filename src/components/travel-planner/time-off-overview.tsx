"use client";
import { useState } from "react";
import { ArrowRight, CalendarDays } from "lucide-react";
import { formatDay, type Planner } from "@/lib/travel-planner";
import { timeOffGroups } from "@/lib/journey-display";
import { ActionMenu } from "./action-menu";
import s from "./time-off-overview.module.css";

type Break = { start: string; end: string; days: number; names: string[]; planBy: string; bookingAlreadyOpen: boolean };
/** Presents upcoming leave first, retaining past records and individual-day actions. */
export function TimeOffOverview({ holidays, today, breaks, remove, plan }: {
  holidays: Planner["holidays"]; today: string; breaks: Break[];
  remove: (id: string) => void; plan: (date: string) => void;
}) {
  const [past, setPast] = useState(false);
  const groups = timeOffGroups(holidays, today, past);
  const date = (value: string) => formatDay(value, { day: "numeric", month: "short", year: "numeric" });
  return <div className={s.layout}>
    <section aria-label="Your Time Off">
      <div className={s.heading}><h2>Your Time Off</h2><div className={s.filters} role="group" aria-label="Time off period">
        <button type="button" aria-pressed={!past} onClick={() => setPast(false)}>Upcoming</button>
        <button type="button" aria-pressed={past} onClick={() => setPast(true)}>Past</button>
      </div></div>
      <div className={s.list}>{groups.map(group => <details className={s.range} key={`${group.type}-${group.name}-${group.start}`}>
        <summary><span className={s.date} aria-hidden="true"><b>{formatDay(group.start, { day: "2-digit" })}</b><span>{formatDay(group.start, { month: "short" })}</span></span>
          <span className={s.description}><strong>{group.name}</strong><span>{date(group.start)}{group.end !== group.start ? ` – ${date(group.end)}` : ""}</span></span>
          <span className={s.kind}>{group.type === "company" ? "Company" : "Personal"}{group.days.length > 1 ? ` · ${group.days.length} days` : ""}</span>
        </summary>
        <div className={s.days}>{group.days.map(day => <div className={s.day} key={day.id}><span>{date(day.date)}</span><ActionMenu label={`Actions For ${day.name} on ${day.date}`} actions={[{ label: "Remove time off", danger: true, onClick: () => remove(day.id) }]} /></div>)}</div>
      </details>)}{!groups.length && <div className={s.empty}><CalendarDays size={24} aria-hidden="true"/><strong>{past ? "No past time off" : "No upcoming time off"}</strong><p>{past ? "Past holidays and leave will appear here." : "Add time off or import company holidays to plan your next break."}</p></div>}</div>
    </section>
    <aside aria-label="Long weekends"><div className={s.heading}><h2>Long Weekends Worth A Trip</h2></div><div className={s.list}>
      {breaks.map(item => <article className={s.opportunity} key={item.start}><div><strong>{item.names.join(" + ")}</strong><span>{date(item.start)} – {date(item.end)}</span><span>{item.bookingAlreadyOpen ? "Booking is open" : `Booking opens ${date(item.planBy)} · 8 AM IST`}</span></div><span className={s.duration}>{item.days} days off</span><button type="button" onClick={() => plan(item.start)} aria-label={`Plan a journey for ${item.names.join(" + ")}`} >Plan a journey <ArrowRight size={16}/></button></article>)}
      {!breaks.length && <p className={s.empty}>No upcoming long weekends in your current time off.</p>}
    </div></aside>
  </div>;
}
