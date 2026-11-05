"use client";
import { safeJourneyDestination } from "@/lib/journey-links";
import { Toast } from "./travel-planner/toast";
import { RailWatchMark } from "@/components/railwatch-mark";

import { Lock, Mail, UserRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import s from "./auth-screen.module.css";

type AuthMode = "firstSignup" | "login" | "resetPassword" | "tokenPassword" | "missingDatabase";

/** Extracts a safe authentication error message from the API response. */
function errorMessage(payload: unknown) {
  const value = payload as { error?: string | { message?: string }; data?: { message?: string } };
  return typeof value.error === "string" ? value.error : value.error?.message ?? "The request could not be completed.";
}

/** Handles sign-in, signup, initial administrator creation, and password-reset requests. */
export function AuthScreen({ mode, allowSignups, token, tokenType }: { mode: AuthMode; allowSignups: boolean; token?: string; tokenType?: "invitation" | "reset" }) {
  const router = useRouter();
  const [view, setView] = useState<"login" | "signup" | "reset" | "forgot">(
    mode === "firstSignup" ? "signup" : mode === "resetPassword" || mode === "tokenPassword" ? "reset" : "login",
  );
  const [message, setMessage] = useState<string>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

    /** Validates the active form and submits its account-scoped changes. */
  async function submit(endpoint: string, payload: Record<string, unknown>) {
    setBusy(true);
    setMessage(undefined);
    setError(undefined);
    try {
      const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(errorMessage(data));
      const next=new URL(location.href).searchParams.get("next");router.replace(next?safeJourneyDestination(next):"/");
      router.refresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "The request could not be completed.");
    } finally {
      setBusy(false);
    }
  }

    /** Requests a password-reset link without revealing whether an account exists. */
  async function submitForgot(formData: FormData) {
    setBusy(true);
    setError(undefined);
    try {
      const response = await fetch("/api/auth/forgot-password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(Object.fromEntries(formData)) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(errorMessage(payload));
      setMessage(payload.data?.message ?? "If that account exists, a reset link has been sent.");
      setView("login");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "The request could not be completed.");
    } finally {
      setBusy(false);
    }
  }

  if (mode === "missingDatabase") {
    return <AuthShell><div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">The database is not configured. Contact the administrator.</div></AuthShell>;
  }

  return (
    <AuthShell>
      {error && <Toast key={error} error message={error} dismiss={()=>setError(undefined)}/>}
      {message && !error && <Toast key={message} message={message} dismiss={()=>setMessage(undefined)}/>}

      {view === "login" && (
        <form action={(form) => submit("/api/auth/login", Object.fromEntries(form))} className={s.authForm} aria-labelledby="sign-in-title">
          <h2 id="sign-in-title" className={s.formTitle}>Sign in</h2>
          <Field icon={Mail} name="email" type="email" label="Email" autoComplete="email" />
          <Field icon={Lock} name="password" type="password" label="Password" autoComplete="current-password" aside={<button type="button" className={s.inlineLink} onClick={() => setView("forgot")}>Forgot?</button>} />
          <Primary busy={busy}>Sign in</Primary>
          <p className={s.invite}>{allowSignups ? <>New here? <button type="button" onClick={() => setView("signup")} className={s.inlineLink}>Create account</button></> : "New here? Ask your RailWatch admin for an invite."}</p>
        </form>
      )}

      {view === "forgot" && (
        <form action={submitForgot} className="grid gap-3">
          <p className="text-sm text-slate-600">Enter your email to receive a one-time reset link.</p>
          <Field icon={Mail} name="email" type="email" label="Email" autoComplete="email" />
          <Primary busy={busy}>Send reset link</Primary>
          <button type="button" onClick={() => setView("login")} className="text-sm font-medium text-blue-700">Back to sign in</button>
        </form>
      )}

      {view === "signup" && (
        <form action={(form) => submit("/api/auth/signup", Object.fromEntries(form))} className="grid gap-3">
          <Field icon={UserRound} name="name" label="Name" autoComplete="name" />
          <Field icon={Mail} name="email" type="email" label="Email" autoComplete="email" />
          <Field icon={Lock} name="password" type="password" label="Password" autoComplete="new-password" />
          <p className="text-xs leading-5 text-slate-500">Use at least 12 characters with uppercase, lowercase, number, and symbol.</p>
          <Primary busy={busy}>Create</Primary>
          {mode !== "firstSignup" && <button type="button" onClick={() => setView("login")} className="text-sm font-medium text-blue-700">Back to sign in</button>}
        </form>
      )}

      {view === "reset" && (
        <form action={(form) => submit("/api/auth/reset-password", { ...Object.fromEntries(form), token, type: tokenType })} className="grid gap-3">
          {!token && mode === "tokenPassword" && <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">This password link is incomplete.</div>}
          <Field icon={Lock} name="password" type="password" label="New password" autoComplete="new-password" />
          <p className="text-xs leading-5 text-slate-500">Use at least 12 characters with uppercase, lowercase, number, and symbol.</p>
          <Primary busy={busy} disabled={mode === "tokenPassword" && !token}>Set password</Primary>
        </form>
      )}
    </AuthShell>
  );
}

/** Provides the shared account-authentication screen layout. */
function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <main className={`${s.root} ${s.authPage}`} data-theme="dark">
      {/* Plan 2.9: brand panel beside the form on wide screens. */}
      <aside className={s.brandPanel} aria-label="About RailWatch"><div className={s.panelBrand}><span className={s.brandMark}><RailWatchMark size={24} /></span><b>RailWatch</b></div><div className={s.panelBody}><h2>Your journeys, ahead of time.</h2><ul><li data-tone="open">A reminder before every booking window opens</li><li data-tone="booked">Tickets kept with each journey, readable offline</li><li data-tone="off">Routines that work around your holidays and leave</li></ul></div><small>Independent planning tool. Not affiliated with or endorsed by IRCTC or Indian Railways.</small></aside>
      <section className={s.authCard}>
        <div className={s.authBrand}><div className={s.brandMark}><RailWatchMark size={30} /></div><div><h1>RailWatch</h1><p>Your journeys, ahead of time</p></div></div>
        <div className="grid gap-3">{children}</div>
        <p className="mt-5 border-t border-slate-100 pt-3 text-xs leading-5 text-slate-500">Independent ticket planning tool. Not affiliated with or endorsed by IRCTC or Indian Railways.</p>
      </section>
    </main>
  );
}

/** Associates a form control with its generated label and optional help text. */
function Field({ icon: Icon, label, aside, ...input }: { icon: React.ComponentType<{ className?: string }>; label: string; aside?: React.ReactNode; name: string; type?: string; autoComplete?: string }) {
  const id = useId();
  return <div className={s.field}><span className={s.labelRow}><label htmlFor={id}>{label}</label>{aside}</span><span className={s.authInput}><Icon className="h-4 w-4" /><input id={id} required {...input} /></span></div>;
}

/** Renders a primary authentication action with its busy state. */
function Primary({ busy, disabled, children }: { busy: boolean; disabled?: boolean; children: React.ReactNode }) {
  return <button disabled={busy || disabled} className={`${s.button} ${s.primary}`}>{busy ? "Please wait..." : children}</button>;
}
