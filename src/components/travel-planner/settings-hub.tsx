"use client";
import { ADMIN_SECTIONS, PERSONAL_SECTIONS as SECTIONS } from "./settings-nav";
import { settingsNavigationAllowed } from "./settings-guard";
import Link from "next/link";
import { useEffect, useState } from "react";
import { offlineCount, offlineEnabled, offlineSupported, setOfflineEnabled } from "@/lib/offline-tickets";
import type { Planner } from "@/lib/travel-planner";
import { PwaInstall } from "../pwa-install";
import { EmailTickets } from "./email-tickets";
import s from "./settings-hub.module.css";

/**
 * Settings, one place per topic (no section sends you to another to edit):
 *  Account (profile, email, password) · Reminders (where: this device, email, Telegram; when: schedules, quiet hours)
 *  · Trips (days off) · Connections (calendar sync, live feed, email tickets) · Devices & data (offline, backup, install).
 * Old #settings-<id> links map onto the new sections.
 */

const ALIASES: Record<string, string> = { profile: "account", security: "account", preferences: "reminders", offline: "devices", data: "devices", "email-tickets": "connections" };
const sectionFor = (hash: string) => { const id = hash.replace(/^#?settings-/, ""); const key = ALIASES[id] ?? id; return SECTIONS.some(x => x.id === key) ? key : undefined; };

/** Settings (plan 2.8, canvas Settings.dc.html). */
export function SettingsHub({ personal, admin, planner, backup, restore, exportCalendar, syncOffline }: {
  personal: (section: string) => React.ReactNode; admin: boolean; planner: Planner; saving: boolean; saveSettings: (next: Planner["settings"]) => void;
  backup: () => void; restore: (file: File) => void; exportCalendar: () => void; syncOffline: () => Promise<number>;
}) {
  const [section, setSection] = useState<string>("account");
  // Phones show the section list first, then one section with a Back button.
  const [picked, setPicked] = useState(false);
  useEffect(() => { const sync = () => { const key = sectionFor(window.location.hash); if (key) { setSection(key); setPicked(true); } }; sync(); window.addEventListener("hashchange", sync); return () => window.removeEventListener("hashchange", sync); }, []);
  const nav = (id: string) => { const go = () => { setSection(id); setPicked(true); window.history.replaceState(null, "", "#settings-" + id); }; if (settingsNavigationAllowed(go)) go(); };
  const back = () => { const go = () => { setPicked(false); window.history.replaceState(null, "", window.location.pathname); }; if (settingsNavigationAllowed(go)) go(); };
  const current = SECTIONS.find(x => x.id === section)!;
  const head = (title: string, hint: string) => <header className={s.sectionHead}><h2 id={`settings-${section}-h`}>{title}</h2><span className={s.muted}>{hint}</span></header>;
  return <div className={s.page} data-picked={picked || undefined}>
    <div className={s.layout}>
      <nav aria-label="Settings sections" className={s.nav}>
        <span className={s.navGroup}>You</span>
        {SECTIONS.map(x => <button key={x.id} type="button" className={s.navItem} aria-current={section === x.id ? "page" : undefined} onClick={() => nav(x.id)}><span>{x.label}</span><small>{x.hint}</small></button>)}
        {admin && <><span className={s.navGroup}>Workspace · Admin</span>
          {ADMIN_SECTIONS.map(x => <Link key={x.id} className={s.navItem} href={x.href}><span>{x.label}</span><small>{x.hint}</small></Link>)}</>}
      </nav>
      <div className={s.content}>
        <button type="button" className={s.back} onClick={back}>← Settings</button>
        <section id={`settings-${section}`} aria-labelledby={`settings-${section}-h`} className={s.section} key={section}>
          {head(current.label, current.hint)}
          {section === "account" && <>{personal("profile")}{personal("security")}</>}
          {section === "reminders" && <>
            <h3 className={s.subhead}>Where</h3>
            <DeliveryStatus planner={planner} />
            {personal("channels")}
            <h3 className={s.subhead}>When</h3>
            <span className={s.muted}>Normal booking opens {planner.settings.bookingWindowDays} days before travel (set by your admin). Times are IST. A chart check runs 4 hours before departure for RAC and waitlisted tickets.</span>
            {personal("schedules")}
          </>}
          {section === "trips" && personal("daysoff")}
          {section === "connections" && <>
            {personal("calendar")}
            <div className={s.card}><CalendarFeed />
              <div className={s.toggleRow}><span><strong>Export Calendar</strong><span className={s.muted}>A one-off .ics file of your journeys and booking dates</span></span><button type="button" className={s.btn} onClick={exportCalendar}>Export</button></div></div>
            <EmailTickets />
          </>}
          {section === "devices" && <>
            <OfflineTickets sync={syncOffline} />
            <div className={s.card}>
              <div className={s.toggleRow}><span><strong>Download Backup</strong><span className={s.muted}>Everything in your workspace as one file</span></span><button type="button" className={s.btn} onClick={backup}>Download</button></div>
              <div className={s.toggleRow}><span><strong>Restore Backup</strong><span className={s.muted}>Replace your workspace from a backup file</span></span><label className={s.btn}>Choose file<input type="file" accept="application/json,.json" className={s.file} onChange={e => { const f = e.target.files?.[0]; if (f) restore(f); e.target.value = ""; }} /></label></div>
              <div className={s.toggleRow}><span><strong>Install The App</strong><span className={s.muted}>Open RailWatch from your home screen or dock</span></span><PwaInstall /></div>
            </div>
          </>}
        </section>
      </div>
    </div>
  </div>;
}

/** A switch styled as on the board. */
function Switch({ on, label, onChange, disabled }: { on: boolean; label: string; onChange: (next: boolean) => void; disabled?: boolean }) {
  return <button type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled} className={s.switch} onClick={() => onChange(!on)}><span /></button>;
}

/** Opt-in offline tickets for this device (plan 3.6). */
function OfflineTickets({ sync }: { sync: () => Promise<number> }) {
  const [on, setOn] = useState(false), [count, setCount] = useState(0), [busy, setBusy] = useState(false), [supported, setSupported] = useState(true);
  useEffect(() => { let live = true; const sup = offlineSupported(), e = sup && offlineEnabled(); void offlineCount().then(n => { if (live) { setSupported(sup); setOn(e); setCount(n); } }); return () => { live = false; }; }, []);
  async function toggle(next: boolean) { setOfflineEnabled(next); setOn(next); setBusy(true); try { if (next) await sync(); setCount(next ? await offlineCount() : 0); } finally { setBusy(false); } }
  return <section id="settings-offline" aria-labelledby="settings-offline-h" className={s.section}><h3 id="settings-offline-h">Offline tickets <span className={s.pill}>New</span></h3><div className={s.card}><div className={s.toggleRow}><span><strong>Keep upcoming tickets on this device</strong><span className={s.muted}>{!supported ? "This browser can’t store tickets securely." : on ? `${count} ${count === 1 ? "ticket" : "tickets"} for the next 3 days, encrypted, removed after travel. Opens with no signal.` : "Next 3 days, encrypted, removed after travel. Opens with no signal."}</span></span><Switch on={on} label="Keep upcoming tickets on this device" disabled={busy || !supported} onChange={next => void toggle(next)} /></div></div></section>;
}

type Delivery = { lastSent: string | null; next: string | null; failing: { at: string; error: string } | null };
const ago = (iso: string) => { const m = Math.round((Date.now() - Date.parse(iso)) / 60000); return m < 60 ? `${Math.max(m, 1)} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`; };
const when = (iso: string) => new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Kolkata" }).format(new Date(iso));

/** Shows whether reminders are actually reaching the user, per channel. */
function DeliveryStatus({ planner, go }: { planner: Planner; go?: () => void }) {
  const [data, setData] = useState<{ deliveries?: Record<string, Delivery>; emailVerified?: boolean; telegram?: { enabled: boolean } | null }>();
  useEffect(() => { let live = true; void fetch("/api/railwatch/connections", { credentials: "same-origin" }).then(r => r.ok ? r.json() : undefined).then(j => { if (live && j) setData(j.data ?? j); }).catch(() => undefined); return () => { live = false; }; }, []);
  if (!data?.deliveries) return null;
  const st = planner.settings, d = data.deliveries;
  const channels = [
    { id: "PUSH", label: "This device", on: Boolean(d.PUSH?.lastSent || d.PUSH?.next || d.PUSH?.failing) },
    { id: "TELEGRAM", label: "Telegram", on: Boolean(data.telegram?.enabled && st.telegramEnabled) },
    { id: "EMAIL", label: "Email", on: Boolean(st.emailEnabled && data.emailVerified) },
  ].filter(c => c.on);
  return <div className={s.card} aria-label="Reminder delivery">
    {!channels.length ? <div className={s.toggleRow} data-warn><span><strong>No reminder channel is on</strong><span className={s.muted}>You won’t be reminded when booking opens. Turn one on below.</span></span>{go && <button type="button" className={s.btn} onClick={go}>Set up</button>}</div>
      : channels.map(c => { const x = d[c.id]; return <div key={c.id} className={s.toggleRow} data-warn={x?.failing ? true : undefined}><span><strong>{c.label}</strong><span className={s.muted}>{x?.failing ? `Failing since ${ago(x.failing.at)}. ${x.failing.error}` : [x?.lastSent ? `Last sent ${ago(x.lastSent)}` : "Nothing sent yet", x?.next ? `next ${when(x.next)}` : ""].filter(Boolean).join(" · ")}</span></span>{x?.failing && <button type="button" className={s.btn} onClick={go}>Fix</button>}</div>; })}
  </div>;
}

/** Live calendar feed: a private URL Google Calendar and Outlook subscribe to and refresh on their own. */
function CalendarFeed() {
  const [url, setUrl] = useState(""), [busy, setBusy] = useState(false), [copied, setCopied] = useState(false), [error, setError] = useState("");
  async function issue() {
    setBusy(true); setError("");
    try { const r = await fetch("/api/railwatch/calendar/feed", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: "{}" }); const j = await r.json(); if (!r.ok) throw new Error(j.error?.message ?? "Couldn’t create the link."); setUrl((j.data ?? j).url); setCopied(false); }
    catch (e) { setError(e instanceof Error ? e.message : "Couldn’t create the link."); } finally { setBusy(false); }
  }
  return <div className={s.toggleRow}>
    <span><strong>Live calendar feed</strong><span className={s.muted}>Subscribe once in Google Calendar or Outlook and journeys, booking openings and time off stay in sync. Anyone with the link can see your trips.</span>
      {url && <span className={s.feed}><input readOnly value={url} aria-label="Calendar feed link" onFocus={e => e.currentTarget.select()} /><button type="button" className={s.btn} onClick={() => { void navigator.clipboard.writeText(url).then(() => setCopied(true)); }}>{copied ? "Copied" : "Copy"}</button></span>}
      {url && <span className={s.muted}>Google Calendar: Other calendars → + → From URL. Outlook: Add calendar → Subscribe from web. Updates arrive within a few hours.</span>}
      {error && <span role="alert" className={s.muted}>{error}</span>}
    </span>
    <button type="button" className={s.btn} disabled={busy} onClick={() => void issue()}>{busy ? "Working…" : url ? "Reset link" : "Get link"}</button>
  </div>;
}
