"use client";
import s from "./loader.module.css";

/** A small brand-coloured spinner; decorative, so screen readers get the accompanying text instead. */
export function Spinner({ size = 16 }: { size?: number }) {
  return <span className={s.spinner} style={{ width: size, height: size }} aria-hidden="true" />;
}

/** A thin progress bar across the top of the page while a page is loading its data. */
export function TopProgress({ active }: { active: boolean }) {
  return active ? <div className={s.progress} role="progressbar" aria-label="Loading" /> : null;
}

/** A floating status pill for work the user started and is waiting on (e.g. reading a ticket). */
export function BusyPill({ label }: { label: string }) {
  return label ? <div className={s.pill} role="status" aria-live="polite"><Spinner />{label}</div> : null;
}
