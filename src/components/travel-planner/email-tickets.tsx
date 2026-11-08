"use client";
import { useEffect, useState } from "react";
import s from "./settings-hub.module.css";

type Status = { gmail: boolean; imap: { host: string; port: number; user: string } | null; forwarding: string | null; checkedAt: string | null; lastResult: string | null; lastError: string | null; notice: string | null };

async function call<T>(method: string, body?: unknown, query = ""): Promise<T> {
  const r = await fetch(`/api/railwatch/mail${query}`, { method, credentials: "same-origin", headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error?.message ?? "Request failed."); return (j.data ?? j) as T;
}
const when = (iso: string) => new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" });

/**
 * Email tickets: IRCTC booking emails (no PDF; the ticket is in the mail) are read and applied to the matching journey —
 * train, PNR, coach, seat, fare and status. Three ways in: Gmail sign-in, a forwarding address, or IMAP with an app password.
 */
export function EmailTickets() {
  const [st, setSt] = useState<Status>(), [busy, setBusy] = useState(""), [error, setError] = useState(""), [note, setNote] = useState(""), [imapOpen, setImapOpen] = useState(false), [copied, setCopied] = useState(false);
  const load = () => call<Status>("GET").then(setSt).catch(e => setError(e.message));
  useEffect(() => { void load(); }, []);
  async function run(key: string, task: () => Promise<unknown>, done?: string) { setBusy(key); setError(""); setNote(""); try { await task(); await load(); if (done) setNote(done); } catch (e) { setError(e instanceof Error ? e.message : "Something went wrong."); } finally { setBusy(""); } }
  const connectGmail = () => run("gmail", async () => { const r = await fetch("/api/railwatch/google/connect?purpose=gmail", { method: "POST", credentials: "same-origin" }); const j = await r.json(); if (!r.ok) throw new Error(j.error?.message ?? "Google sign-in is not set up."); location.href = (j.data ?? j).url; });
  const connected = st && (st.gmail || st.imap || st.forwarding);
  return <section id="settings-email-tickets" aria-labelledby="settings-email-tickets-h" className={s.section}>
    <h2 id="settings-email-tickets-h">Email tickets <span className={s.pill}>New</span></h2>
    <span className={s.muted}>IRCTC’s booking email has the ticket details in it. RailWatch reads it, finds the journey by date and route, and fills in the train, PNR, coach, seat, fare and status. A trip that isn’t planned yet is added as booked.</span>
    <div className={s.card}>
      <div className={s.toggleRow}><span><strong>Gmail</strong><span className={s.muted}>{st?.gmail ? "Connected. Checked every 5 minutes for mail from IRCTC." : "Sign in with Google. Read-only, and RailWatch only looks at mail from IRCTC."}</span></span>
        {st?.gmail ? <button type="button" className={s.btn} disabled={!!busy} onClick={() => void run("gmail", () => call("DELETE", undefined, "?source=gmail"), "Gmail disconnected.")}>Disconnect</button> : <button type="button" className={s.btn} disabled={!!busy} onClick={() => void connectGmail()}>{busy === "gmail" ? "Opening…" : "Connect"}</button>}</div>
      <div className={s.toggleRow}><span><strong>Forwarding address</strong><span className={s.muted}>Forward IRCTC mails from any provider to this address (via an email relay such as Cloudflare Email Routing). Anyone with it can send mail to your RailWatch, so keep it private.</span>
        {st?.forwarding && <span className={s.feed}><input readOnly value={st.forwarding} aria-label="Forwarding address" onFocus={e => e.currentTarget.select()} /><button type="button" className={s.btn} onClick={() => { void navigator.clipboard.writeText(st.forwarding!).then(() => setCopied(true)); }}>{copied ? "Copied" : "Copy"}</button></span>}</span>
        <span className={s.feed}>{st?.forwarding && <button type="button" className={s.btn} disabled={!!busy} onClick={() => void run("fwd", () => call("DELETE", undefined, "?source=forwarding"), "Forwarding address removed.")}>Remove</button>}<button type="button" className={s.btn} disabled={!!busy} onClick={() => void run("fwd", () => call("POST", { action: "forwarding" }))}>{st?.forwarding ? "Reset" : "Create"}</button></span></div>
      <div className={s.toggleRow}><span><strong>IMAP mailbox</strong><span className={s.muted}>{st?.imap ? `${st.imap.user} on ${st.imap.host}:${st.imap.port}. Checked every 5 minutes.` : "Any provider. Use an app password (Gmail: Google Account → Security → App passwords), never your main password."}</span>
        {imapOpen && !st?.imap && <form className={s.imapForm} onSubmit={e => { e.preventDefault(); const f = new FormData(e.currentTarget); void run("imap", () => call("POST", { action: "imap", host: String(f.get("host")), port: Number(f.get("port")), user: String(f.get("user")), pass: String(f.get("pass")) }), "Mailbox connected.").then(() => setImapOpen(false)); }}>
          <label>Server<input name="host" defaultValue="imap.gmail.com" required /></label><label>Port<input name="port" type="number" defaultValue={993} required /></label>
          <label>Email<input name="user" type="email" autoComplete="off" required /></label><label>App password<input name="pass" type="password" autoComplete="new-password" required /></label>
          <span className={s.feed}><button type="button" className={s.btn} onClick={() => setImapOpen(false)}>Cancel</button><button type="submit" className={s.btn} disabled={!!busy}>{busy === "imap" ? "Testing…" : "Test and save"}</button></span>
        </form>}</span>
        {st?.imap ? <button type="button" className={s.btn} disabled={!!busy} onClick={() => void run("imap", () => call("DELETE", undefined, "?source=imap"), "Mailbox removed.")}>Remove</button> : !imapOpen && <button type="button" className={s.btn} onClick={() => setImapOpen(true)}>Set up</button>}</div>
      {connected && <div className={s.toggleRow}><span><strong>Status</strong><span className={s.muted}>{st!.checkedAt ? `Last checked ${when(st!.checkedAt)}` : "Not checked yet"}{st!.lastResult ? ` · Last ticket: ${st!.lastResult}` : ""}</span>{st!.lastError && <span role="alert" className={s.warnText}>{st!.lastError}</span>}</span>
        {(st!.gmail || st!.imap) && <button type="button" className={s.btn} disabled={!!busy} onClick={() => void run("check", async () => { const r = await call<{ checked: number; applied: string[] }>("POST", { action: "check" }); setNote(r.applied.length ? `Applied ${r.applied.length} ticket${r.applied.length === 1 ? "" : "s"}.` : "No new IRCTC tickets."); })}>{busy === "check" ? "Checking…" : "Check now"}</button>}</div>}
      {st?.notice && <div className={s.toggleRow} data-warn><span><strong>Gmail forwarding confirmation</strong><span className={s.muted}>{st.notice}</span></span><button type="button" className={s.btn} onClick={() => void run("notice", () => call("DELETE", undefined, "?source=notice"))}>Dismiss</button></div>}
    </div>
    {(error || note) && <span role={error ? "alert" : "status"} className={error ? s.warnText : s.muted}>{error || note}</span>}
  </section>;
}
