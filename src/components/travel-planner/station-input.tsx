"use client";
import { useEffect, useId, useRef, useState, type InputHTMLAttributes, type KeyboardEvent } from "react";
import { loadStations, searchStations, type Station } from "@/lib/stations";
import s from "./station-input.module.css";

/**
 * Station field with an app-styled suggestion list. Suggestions come from the bundled IRCTC station
 * directory, ranked so the user's own stations (routines and recent journeys) come first.
 */
export function StationInput({ recent = [], className, ...props }: { recent?: readonly string[] } & Omit<InputHTMLAttributes<HTMLInputElement>, "list">) {
  const id = useId(), input = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState(String(props.defaultValue ?? "")), [all, setAll] = useState<readonly Station[]>([]);
  const [open, setOpen] = useState(false), [active, setActive] = useState(0);
  useEffect(() => { let live = true; void loadStations().then((list) => { if (live) setAll(list); }); return () => { live = false; }; }, []);
  const options = searchStations(all, query, recent).slice(0, 8);
  /** Writes the chosen code into the uncontrolled input so forms and change listeners see it. */
  function choose(code: string) {
    const el = input.current; if (!el) return;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set; setter?.call(el, code);
    el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true }));
    setQuery(code); setOpen(false);
  }
  function keys(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setActive(a => Math.min(a + 1, options.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive(a => Math.max(a - 1, 0)); }
    else if (e.key === "Enter" && open && options[active]) { e.preventDefault(); choose(options[active][0]); }
    else if (e.key === "Escape" && open) { e.preventDefault(); setOpen(false); }
    props.onKeyDown?.(e);
  }
  return <span className={s.wrap}>
    <input {...props} ref={input} className={className} role="combobox" aria-expanded={open && options.length > 0} aria-controls={id} aria-autocomplete="list" aria-activedescendant={open && options[active] ? `${id}-${active}` : undefined} autoComplete="off" spellCheck={false}
      onFocus={(e) => { setQuery(e.currentTarget.value); setOpen(true); setActive(0); props.onFocus?.(e); }}
      onBlur={(e) => { setOpen(false); props.onBlur?.(e); }}
      onInput={(e) => { setQuery(e.currentTarget.value); setOpen(true); setActive(0); props.onInput?.(e); }} onKeyDown={keys} />
    {open && options.length > 0 && <ul id={id} role="listbox" className={s.list}>
      {options.map(([code, name], i) => <li key={code} id={`${id}-${i}`} role="option" aria-selected={i === active} className={s.option} onMouseDown={(e) => { e.preventDefault(); choose(code); }} onMouseEnter={() => setActive(i)}>
        <b>{code}</b><span>{name || code}</span>{recent.includes(code) && <small>Yours</small>}
      </li>)}
    </ul>}
  </span>;
}
