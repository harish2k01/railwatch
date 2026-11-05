"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { offlineCount, offlineEnabled, offlineSupported, setOfflineEnabled } from "@/lib/offline-tickets";
import { ArrowRight, CalendarDays, Download, HeartPulse, KeyRound, Plug, Settings2, SlidersHorizontal, Upload, User, Users, Bell } from "lucide-react";
import s from "./settings-hub.module.css";

type Section = { label: string; hint: string; icon: typeof User };

/** One Settings page for everyone (plan 2.8): your settings, your data and, for admins, the workspace. */
export function SettingsHub({ admin, openSection, backup, restore, exportCalendar, syncOffline }: { syncOffline: () => Promise<number>; admin: boolean; openSection: (tab: "profile" | "preferences" | "connections" | "security") => void; backup: () => void; restore: (file: File) => void; exportCalendar: () => void }) {
  const you: (Section & { tab: "profile" | "preferences" | "connections" | "security" })[] = [
    { tab: "profile", label: "Profile", hint: "Name, username, email and phone", icon: User },
    { tab: "preferences", label: "Reminders and preferences", hint: "When reminders arrive, quiet hours, theme and week start", icon: SlidersHorizontal },
    { tab: "connections", label: "Channels", hint: "Telegram, email, device notifications and Google Calendar", icon: Bell },
    { tab: "security", label: "Security", hint: "Password and sign-in", icon: KeyRound },
  ];
  const workspace: (Section & { href: string })[] = [
    { href: "/settings/workspace", label: "Booking rules", hint: "Booking window, routines and features", icon: Settings2 },
    { href: "/settings/workspace/members", label: "Members", hint: "Invite people and manage access", icon: Users },
    { href: "/settings/workspace/integrations", label: "Integrations", hint: "Email delivery, Telegram and Google", icon: Plug },
    { href: "/settings/workspace/health", label: "System health", hint: "Reminder delivery and scheduler", icon: HeartPulse },
  ];
  const row = (sec: Section) => <><sec.icon size={20} aria-hidden="true" /><span className={s.text}><b>{sec.label}</b><small>{sec.hint}</small></span><ArrowRight size={16} aria-hidden="true" /></>;
  return <div className={s.hub}>
    <section aria-labelledby="settings-you"><h2 id="settings-you">You</h2><div className={s.list}>{you.map((sec) => <button key={sec.tab} type="button" className={s.row} aria-label={sec.label} onClick={() => openSection(sec.tab)}>{row(sec)}</button>)}</div></section>
    <OfflineTickets sync={syncOffline} />
    <section aria-labelledby="settings-data"><h2 id="settings-data">Data</h2><div className={s.list}>
      <button type="button" className={s.row} onClick={backup}>{row({ label: "Download backup", hint: "Everything in your workspace as one file", icon: Download })}</button>
      <label className={s.row}>{row({ label: "Restore backup", hint: "Replace your workspace from a backup file", icon: Upload })}<input type="file" accept="application/json,.json" className={s.file} onChange={(e) => { const f = e.target.files?.[0]; if (f) restore(f); e.target.value = ""; }} /></label>
      <button type="button" className={s.row} onClick={exportCalendar}>{row({ label: "Export calendar", hint: "An .ics file of your journeys and booking dates", icon: CalendarDays })}</button>
    </div></section>
    {admin && <section aria-labelledby="settings-workspace"><h2 id="settings-workspace">Workspace</h2><div className={s.list}>{workspace.map((sec) => <Link key={sec.href} href={sec.href} className={s.row} aria-label={sec.label}>{row(sec)}</Link>)}</div></section>}
  </div>;
}

/** Opt-in offline tickets for this device (plan 3.6). */
function OfflineTickets({ sync }: { sync: () => Promise<number> }) {
  const [on, setOn] = useState(false), [count, setCount] = useState(0), [busy, setBusy] = useState(false), [supported, setSupported] = useState(true);
  useEffect(() => { let live = true; const s = offlineSupported(), e = s && offlineEnabled(); void offlineCount().then(n => { if (live) { setSupported(s); setOn(e); setCount(n); } }); return () => { live = false; }; }, []);
  async function toggle(next: boolean) { setOfflineEnabled(next); setOn(next); setBusy(true); try { if (next) await sync(); setCount(next ? await offlineCount() : 0); } finally { setBusy(false); } }
  return <section aria-labelledby="settings-offline"><h2 id="settings-offline">Offline tickets</h2><div className={s.list}><label className={s.row}><span className={s.text}><b>Keep upcoming tickets on this device</b><small>{!supported ? "This browser can’t store tickets securely." : on ? `${count} ${count === 1 ? "ticket" : "tickets"} for the next 72 hours, encrypted on this device. Removed after travel and when you sign out.` : "Ticket PDFs for the next 72 hours, encrypted with a key that can’t leave this device. Open them from the offline page."}</small></span><input type="checkbox" checked={on} disabled={busy || !supported} onChange={e => void toggle(e.target.checked)} aria-label="Keep upcoming tickets on this device" /></label></div></section>;
}
