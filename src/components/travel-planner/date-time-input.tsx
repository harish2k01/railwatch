"use client";
import { useEffect, useId, useLayoutEffect, useRef, useState, useSyncExternalStore, type InputHTMLAttributes, type KeyboardEvent } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Clock } from "lucide-react";
import p from "./date-time-input.module.css";

/**
 * Date and time fields in RailWatch's style. The real <input type="date|time"> stays (typing, form submission,
 * validation and min/max all keep working); the browser's own picker button is hidden and replaced by an app-styled
 * popover. On touch screens tapping the field opens the popover instead of the platform picker.
 */
type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & { ref?: React.Ref<HTMLInputElement> };
/** Points both our ref and the caller's at the input. */
function both(own: React.RefObject<HTMLInputElement | null>, outer?: React.Ref<HTMLInputElement>) { return (el: HTMLInputElement | null) => { own.current = el; if (typeof outer === "function") outer(el); else if (outer) (outer as React.RefObject<HTMLInputElement | null>).current = el; }; }

const coarse = () => typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;
function useCoarse() { return useSyncExternalStore(cb => { const q = window.matchMedia("(pointer: coarse)"); q.addEventListener("change", cb); return () => q.removeEventListener("change", cb); }, coarse, () => false); }

/** Sets the input's value the way typing would, so React onChange and form state both see it. */
function commit(input: HTMLInputElement | null, value: string) {
  if (!input) return;
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

/** Places the popover under the field (fixed, so dialogs with scrolling bodies don't clip it), flipping above if needed. */
function usePlacement(open: boolean, anchor: React.RefObject<HTMLElement | null>, pop: React.RefObject<HTMLElement | null>) {
  const [style, setStyle] = useState<React.CSSProperties>({ position: "fixed", top: 0, left: 0, visibility: "hidden" });
  const applied = useRef({ top: 0, left: 0 });
  useLayoutEffect(() => {
    if (!open) return; // the style kept from last time still matches applied, so the measurement stays right
    const place = () => {
      const a = anchor.current?.getBoundingClientRect(), el = pop.current, h = el?.offsetHeight ?? 320, w = el?.offsetWidth ?? 296;
      if (!a || !el) return;
      const below = a.bottom + 6 + h <= window.innerHeight || a.top < h + 6;
      const top = below ? a.bottom + 6 : a.top - h - 6, left = Math.max(8, Math.min(a.left, window.innerWidth - w - 8));
      // A transformed ancestor (the dialog) makes "fixed" relative to itself, not the viewport: measure where (0,0)
      // lands (its current box minus the offsets last applied) and subtract it, so it sits under the field either way.
      const rect = el.getBoundingClientRect(), origin = { top: rect.top - applied.current.top, left: rect.left - applied.current.left };
      applied.current = { top: top - origin.top, left: left - origin.left };
      setStyle({ position: "fixed", ...applied.current });
    };
    place();
    window.addEventListener("resize", place); window.addEventListener("scroll", place, true);
    return () => { window.removeEventListener("resize", place); window.removeEventListener("scroll", place, true); };
  }, [open, anchor, pop]);
  return style;
}

/** Closes on outside pointer-down or Escape, returning focus to the field. */
function useDismiss(open: boolean, close: () => void, wrap: React.RefObject<HTMLElement | null>, pop: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!open) return;
    const down = (e: PointerEvent) => { const t = e.target as Node; if (!wrap.current?.contains(t) && !pop.current?.contains(t)) close(); };
    document.addEventListener("pointerdown", down);
    return () => document.removeEventListener("pointerdown", down);
  }, [open, close, wrap, pop]);
}

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const parse = (v?: string) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(Number(v.slice(0, 4)), Number(v.slice(5, 7)) - 1, Number(v.slice(8, 10))) : undefined);
const WEEK = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** A date field with RailWatch's calendar popover. */
export function DateInput({ className, onClick, ref, ...props }: Props) {
  const input = useRef<HTMLInputElement>(null), wrap = useRef<HTMLSpanElement>(null), pop = useRef<HTMLDivElement>(null);
  const touch = useCoarse(), id = useId();
  const [open, setOpen] = useState(false), [value, setValue] = useState(""), [view, setView] = useState(() => new Date());
  const [focus, setFocus] = useState("");
  const style = usePlacement(open, wrap, pop);
  const close = () => { setOpen(false); input.current?.focus({ preventScroll: true }); };
  useDismiss(open, () => setOpen(false), wrap, pop);
  function show() {
    if (props.disabled || props.readOnly) return;
    const current = input.current?.value ?? "", base = parse(current) ?? parse(String(props.min ?? "")) ?? new Date();
    setValue(current); setView(new Date(base.getFullYear(), base.getMonth(), 1)); setFocus(iso(base)); setOpen(true);
  }
  function choose(day: string) { commit(input.current, day); setOpen(false); input.current?.focus({ preventScroll: true }); }
  const today = iso(new Date()), min = String(props.min ?? ""), max = String(props.max ?? "");
  const allowed = (day: string) => (!min || day >= min) && (!max || day <= max);
  // Six weeks starting on the Monday on or before the 1st.
  const first = new Date(view.getFullYear(), view.getMonth(), 1), start = new Date(first); start.setDate(1 - ((first.getDay() + 6) % 7));
  const days = Array.from({ length: 42 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d; });
  useEffect(() => { if (open) pop.current?.querySelector<HTMLButtonElement>(`[data-day="${focus}"]`)?.focus({ preventScroll: true }); }, [open, focus, view]);
  function key(e: KeyboardEvent) {
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(); return; }
    if (step === undefined && e.key !== "PageUp" && e.key !== "PageDown") return;
    e.preventDefault();
    const d = parse(focus) ?? new Date();
    if (step !== undefined) d.setDate(d.getDate() + step); else d.setMonth(d.getMonth() + (e.key === "PageUp" ? -1 : 1));
    setFocus(iso(d)); if (d.getMonth() !== view.getMonth() || d.getFullYear() !== view.getFullYear()) setView(new Date(d.getFullYear(), d.getMonth(), 1));
  }
  const label = view.toLocaleDateString("en-IN", { month: "long", year: "numeric" });
  return <span ref={wrap} className={`${p.field} ${className ?? ""}`}>
    <input ref={both(input, ref)} type="date" {...props} readOnly={props.readOnly || touch} onClick={e => { onClick?.(e); if (touch) show(); }} onKeyDown={e => { props.onKeyDown?.(e); if (e.key === "ArrowDown" && e.altKey) { e.preventDefault(); show(); } }} />
    <button type="button" className={p.trigger} aria-label="Open calendar" aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? id : undefined} disabled={props.disabled} tabIndex={-1} onClick={() => (open ? setOpen(false) : show())}><CalendarDays size={17} aria-hidden="true" /></button>
    {open && <div ref={pop} id={id} role="dialog" aria-label="Choose a date" className={p.pop} style={style} onKeyDown={key}>
      <div className={p.head}>
        <button type="button" aria-label="Previous month" onClick={() => setView(new Date(view.getFullYear(), view.getMonth() - 1, 1))}><ChevronLeft size={18} /></button>
        <strong aria-live="polite">{label}</strong>
        <button type="button" aria-label="Next month" onClick={() => setView(new Date(view.getFullYear(), view.getMonth() + 1, 1))}><ChevronRight size={18} /></button>
      </div>
      <div className={p.grid} role="grid" aria-label={label}>
        {WEEK.map(w => <span key={w} className={p.dow} aria-hidden="true">{w.slice(0, 2)}</span>)}
        {days.map(d => { const day = iso(d), out = d.getMonth() !== view.getMonth(), ok = allowed(day);
          return <button type="button" key={day} data-day={day} tabIndex={day === focus ? 0 : -1} disabled={!ok} aria-pressed={day === value} aria-label={d.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
            className={p.day} data-out={out || undefined} data-today={day === today || undefined} onClick={() => choose(day)} onFocus={() => setFocus(day)}>{d.getDate()}</button>; })}
      </div>
      <div className={p.foot}>
        {!props.required && <button type="button" onClick={() => choose("")}>Clear</button>}
        <button type="button" disabled={!allowed(today)} onClick={() => choose(today)}>Today</button>
      </div>
    </div>}
  </span>;
}

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));
const MINUTES = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, "0"));

/** A 24-hour time field with RailWatch's hour/minute popover (5-minute steps; any minute can still be typed). */
export function TimeInput({ className, onClick, ref, ...props }: Props) {
  const input = useRef<HTMLInputElement>(null), wrap = useRef<HTMLSpanElement>(null), pop = useRef<HTMLDivElement>(null);
  const touch = useCoarse(), id = useId();
  const [open, setOpen] = useState(false), [hour, setHour] = useState("08"), [minute, setMinute] = useState("00");
  const style = usePlacement(open, wrap, pop);
  useDismiss(open, () => setOpen(false), wrap, pop);
  function show() {
    if (props.disabled || props.readOnly) return;
    const v = input.current?.value || "08:00"; setHour(v.slice(0, 2)); setMinute(v.slice(3, 5)); setOpen(true);
  }
  useEffect(() => { if (!open) return; for (const sel of [`[data-hour="${hour}"]`, `[data-minute="${minute}"]`]) pop.current?.querySelector<HTMLElement>(sel)?.scrollIntoView({ block: "center" }); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps -- scroll once on open
  function set(h: string, m: string) { setHour(h); setMinute(m); commit(input.current, `${h}:${m}`); }
  return <span ref={wrap} className={`${p.field} ${className ?? ""}`}>
    <input ref={both(input, ref)} type="time" {...props} readOnly={props.readOnly || touch} onClick={e => { onClick?.(e); if (touch) show(); }} onKeyDown={e => { props.onKeyDown?.(e); if (e.key === "ArrowDown" && e.altKey) { e.preventDefault(); show(); } }} />
    <button type="button" className={p.trigger} aria-label="Choose time" aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? id : undefined} disabled={props.disabled} tabIndex={-1} onClick={() => (open ? setOpen(false) : show())}><Clock size={17} aria-hidden="true" /></button>
    {open && <div ref={pop} id={id} role="dialog" aria-label="Choose a time" className={`${p.pop} ${p.timePop}`} style={style} onKeyDown={e => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setOpen(false); input.current?.focus(); } }}>
      <div className={p.cols}>
        <div className={p.col} role="listbox" aria-label="Hour">{HOURS.map(h => <button type="button" role="option" key={h} data-hour={h} aria-selected={h === hour} onClick={() => set(h, minute)}>{h}</button>)}</div>
        <div className={p.col} role="listbox" aria-label="Minute">{(MINUTES.includes(minute) ? MINUTES : [...MINUTES, minute].sort()).map(m => <button type="button" role="option" key={m} data-minute={m} aria-selected={m === minute} onClick={() => set(hour, m)}>{m}</button>)}</div>
      </div>
      <div className={p.foot}><button type="button" onClick={() => { setOpen(false); input.current?.focus(); }}>Done</button></div>
    </div>}
  </span>;
}
