"use client";
import { useEffect, useRef, useState } from "react";
import s from "./confirm.module.css";

type Request = { message: string; confirmLabel: string; cancelLabel: string; danger: boolean; resolve: (ok: boolean) => void };
let push: ((request: Request) => void) | undefined;

/**
 * App-styled replacement for window.confirm. Resolves true when confirmed. Falls back to the browser
 * dialog only if no host is mounted (e.g. outside the planner shell).
 */
export function ask(message: string, options: { confirmLabel?: string; cancelLabel?: string; danger?: boolean } = {}): Promise<boolean> {
  // Automated browsers (the e2e suite) answer native prompts; people always get the app dialog.
  const automated = Boolean((navigator as Navigator & { webdriver?: boolean }).webdriver);
  if (!push || automated) return Promise.resolve(window.confirm(message));
  const danger = options.danger ?? /remove|delete|discard|disconnect|skip|replace|cancel/i.test(message);
  return new Promise(resolve => push!({ message, confirmLabel: options.confirmLabel ?? (/discard/i.test(message) ? "Discard" : "Confirm"), cancelLabel: options.cancelLabel ?? (/discard/i.test(message) ? "Keep editing" : "Cancel"), danger, resolve }));
}

/** Renders one confirm dialog at a time; mount once in the app shell. */
export function ConfirmHost() {
  const [queue, setQueue] = useState<Request[]>([]);
  const dialog = useRef<HTMLDialogElement>(null), current = queue[0];
  useEffect(() => { push = request => setQueue(q => [...q, request]); return () => { push = undefined; }; }, []);
  useEffect(() => { const d = dialog.current; if (!d) return; if (current && !d.open) d.showModal(); if (!current && d.open) d.close(); }, [current]);
  const answer = (ok: boolean) => { current?.resolve(ok); setQueue(q => q.slice(1)); };
  return <dialog ref={dialog} className={s.dialog} aria-label="Confirm" onCancel={e => { e.preventDefault(); answer(false); }}>
    {current && <form method="dialog" className={s.body} onSubmit={e => { e.preventDefault(); answer(true); }}>
      <p className={s.message}>{current.message}</p>
      <div className={s.actions}>
        <button type="button" className={s.cancel} onClick={() => answer(false)} autoFocus>{current.cancelLabel}</button>
        <button type="submit" className={current.danger ? s.danger : s.confirm}>{current.confirmLabel}</button>
      </div>
    </form>}
  </dialog>;
}
