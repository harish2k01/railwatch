"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { offlineCount, offlineEnabled, offlineSupported, setOfflineEnabled } from "@/lib/offline-tickets";
import { DEFAULT_TATKAL_SCHEDULE, type Planner, type ReminderSchedule } from "@/lib/travel-planner";
import { legacySchedule } from "./forms";
import { PwaInstall } from "../pwa-install";
import s from "./settings-hub.module.css";

/** "20:00" style cells for one schedule: reminders the day before, and on the day (+N more). */
function cells(schedule: ReminderSchedule) {
  const before = schedule.filter(r => r.daysBefore >= 1).sort((a, b) => a.time.localeCompare(b.time)), day = schedule.filter(r => r.daysBefore === 0).sort((a, b) => a.time.localeCompare(b.time));
  const fmt = (rows: ReminderSchedule) => rows.length ? `${rows[0].time}${rows.length > 1 ? ` · +${rows.length - 1} more` : ""}` : "—";
  return [fmt(before), fmt(day)];
}

/** A switch styled as on the board. */
function Switch({ on, label, onChange, disabled }: { on: boolean; label: string; onChange: (next: boolean) => void; disabled?: boolean }) {
  return <button type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled} className={s.switch} onClick={() => onChange(!on)}><span /></button>;
}

/** Settings (plan 2.8, canvas Settings.dc.html): section nav, Reminders table, where reminders go, offline tickets, data. */
export function SettingsHub({ personal, admin, planner, saving, saveSettings, backup, restore, exportCalendar, syncOffline }: {
  personal: React.ReactNode; admin: boolean; planner: Planner; saving: boolean; saveSettings: (next: Planner["settings"]) => void;
  backup: () => void; restore: (file: File) => void; exportCalendar: () => void; syncOffline: () => Promise<number>;
}) {
  const st = planner.settings;
  const normal = st.bookingSchedule ?? legacySchedule(st.reminderTimes, st.reminderClock);
  const tatkal = st.tatkalSchedule ?? DEFAULT_TATKAL_SCHEDULE;
  const nonAc = st.tatkalNonAcSchedule ?? DEFAULT_TATKAL_SCHEDULE.map(r => r.daysBefore ? r : { ...r, time: r.time.replace("09:", "10:") });
  const rows: [string, string, ReminderSchedule][] = [["Normal", "opens 08:00", normal], ["Tatkal AC", "opens 10:00", tatkal], ["Tatkal non-AC", "opens 11:00", nonAc]];
  const quiet = st.quietHours?.enabled ?? false;
  const nav = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  return <div className={s.page}>
    <div className={s.layout}>
      <nav aria-label="Settings sections" className={s.nav}>
        <span className={s.navGroup}>You</span>
        <button type="button" className={s.navItem} onClick={() => nav("settings-profile")}>Profile</button>
        <button type="button" className={s.navItem} onClick={() => nav("settings-preferences")}>Preferences</button>
        <button type="button" className={s.navItem} onClick={() => nav("settings-reminders")}>Reminders</button>
        <button type="button" className={s.navItem} onClick={() => nav("settings-connections")}>Connections</button>
        <button type="button" className={s.navItem} onClick={() => nav("settings-offline")}>Offline tickets</button>
        <button type="button" className={s.navItem} onClick={() => nav("settings-data")}>Data and backup</button>
        <button type="button" className={s.navItem} onClick={() => nav("settings-security")}>Security</button>
        {admin && <><span className={s.navGroup}>Workspace · admin</span>
          <Link className={s.navItem} href="/settings/workspace">Booking rules</Link>
          <Link className={s.navItem} href="/settings/workspace/members">Members</Link>
          <Link className={s.navItem} href="/settings/workspace/integrations">Integrations</Link>
          <Link className={s.navItem} href="/settings/workspace/health">System health</Link></>}
      </nav>
      <div className={s.content}>
        {personal}
        <section id="settings-reminders" aria-labelledby="settings-reminders-h" className={s.section}>
          <h2 id="settings-reminders-h">Reminders</h2>
          <span className={s.muted}>Normal booking opens {st.bookingWindowDays} days before travel (set by your admin). Times are IST.</span>
          <div className={s.card}><table className={s.table}><thead><tr><th scope="col">Booking type</th><th scope="col">Day before</th><th scope="col">On the day</th><th scope="col"><span className={s.sr}>Edit</span></th></tr></thead><tbody>
            {rows.map(([name, opens, schedule]) => { const [a, b] = cells(schedule); return <tr key={name}><td><strong>{name}</strong> <span className={s.muted}>· {opens}</span></td><td>{a}</td><td>{b}</td><td><button type="button" className={s.btn} aria-label={`Edit ${name} reminders`} onClick={() => nav("settings-preferences")}>Edit</button></td></tr>; })}
            <tr><td><strong>Cancellation</strong></td><td colSpan={2}>{st.cancellationEnabled ? `Daily at ${st.cancellationTime} until confirmed` : "Off"}</td><td><button type="button" className={s.btn} aria-label="Edit cancellation reminders" onClick={() => nav("settings-preferences")}>Edit</button></td></tr>
            <tr><td><strong>Chart check</strong> <span className={s.pill}>New</span></td><td colSpan={2}>4 hours before departure, for RAC and waitlist tickets</td><td /></tr>
          </tbody></table></div>
          <div className={s.card}><div className={s.toggleRow}><span><strong>Quiet hours</strong><span className={s.muted}>Hold non-urgent reminders overnight{quiet && st.quietHours ? ` (${st.quietHours.start}–${st.quietHours.end})` : ""}</span></span><Switch on={quiet} label="Quiet hours" disabled={saving} onChange={on => saveSettings({ ...st, quietHours: { start: st.quietHours?.start ?? "22:00", end: st.quietHours?.end ?? "07:00", enabled: on } })} /></div></div>
        </section>
        <OfflineTickets sync={syncOffline} />
        <section id="settings-data" aria-labelledby="settings-data-h" className={s.section}>
          <h2 id="settings-data-h">Data and backup</h2>
          <div className={s.card}>
            <div className={s.toggleRow}><span><strong>Download backup</strong><span className={s.muted}>Everything in your workspace as one file</span></span><button type="button" className={s.btn} onClick={backup}>Download</button></div>
            <div className={s.toggleRow}><span><strong>Restore backup</strong><span className={s.muted}>Replace your workspace from a backup file</span></span><label className={s.btn}>Choose file<input type="file" accept="application/json,.json" className={s.file} onChange={e => { const f = e.target.files?.[0]; if (f) restore(f); e.target.value = ""; }} /></label></div>
            <div className={s.toggleRow}><span><strong>Export calendar</strong><span className={s.muted}>An .ics file of your journeys and booking dates</span></span><button type="button" className={s.btn} onClick={exportCalendar}>Export</button></div>
            <div className={s.toggleRow}><span><strong>Install the app</strong><span className={s.muted}>Open RailWatch from your home screen or dock</span></span><PwaInstall /></div>
          </div>
        </section>
      </div>
    </div>
  </div>;
}

/** Opt-in offline tickets for this device (plan 3.6). */
function OfflineTickets({ sync }: { sync: () => Promise<number> }) {
  const [on, setOn] = useState(false), [count, setCount] = useState(0), [busy, setBusy] = useState(false), [supported, setSupported] = useState(true);
  useEffect(() => { let live = true; const sup = offlineSupported(), e = sup && offlineEnabled(); void offlineCount().then(n => { if (live) { setSupported(sup); setOn(e); setCount(n); } }); return () => { live = false; }; }, []);
  async function toggle(next: boolean) { setOfflineEnabled(next); setOn(next); setBusy(true); try { if (next) await sync(); setCount(next ? await offlineCount() : 0); } finally { setBusy(false); } }
  return <section id="settings-offline" aria-labelledby="settings-offline-h" className={s.section}><h2 id="settings-offline-h">Offline tickets <span className={s.pill}>New</span></h2><div className={s.card}><div className={s.toggleRow}><span><strong>Keep upcoming tickets on this device</strong><span className={s.muted}>{!supported ? "This browser can’t store tickets securely." : on ? `${count} ${count === 1 ? "ticket" : "tickets"} for the next 3 days, encrypted, removed after travel. Opens with no signal.` : "Next 3 days, encrypted, removed after travel. Opens with no signal."}</span></span><Switch on={on} label="Keep upcoming tickets on this device" disabled={busy || !supported} onChange={next => void toggle(next)} /></div></div></section>;
}
