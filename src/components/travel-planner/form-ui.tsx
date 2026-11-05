"use client";
import {cloneElement,useEffect,useId,useRef,type ReactElement,type ReactNode} from "react";
import {X} from "lucide-react";
import s from "./planner.module.css";
/** Associates a form control with its generated label and optional help text. */
export function Field({ label, children, hint }: { label: string; children: ReactElement; hint?: string }) {
  const id = useId();
  return <div className={s.field}><label htmlFor={id}>{label}</label>{cloneElement(children as ReactElement<{ id: string; "aria-describedby"?: string }>, { id, "aria-describedby": hint ? `${id}-hint` : undefined })}{hint && <small id={`${id}-hint`}>{hint}</small>}</div>;
}
/** Opens an accessible item dialog and closes it when dismissed or unmounted. */
/** A dialog; `docked` shows it as a non-modal side panel beside the page (journey details on desktop). */
export function Modal({ title, subtitle, children, close, wide = false, guard = false, className = "", docked = false }: { title: string; subtitle?: string; children: ReactNode; close: () => void; wide?: boolean; guard?: boolean; className?:string; docked?: boolean }) {
  const titleId=useId();const ref = useRef<HTMLDialogElement>(null);
  const dirty = useRef(false);
  /** Preserves form edits when a dialog is dismissed accidentally. */
  function dismiss() { if (!guard || !dirty.current || confirm("Discard your unsaved changes?")) close(); }
  useEffect(() => {
    if (!guard) return;
    /** Warns before closing or reloading a page with unsaved form edits. */
    const warn = (event: BeforeUnloadEvent) => { if (dirty.current) { event.preventDefault(); event.returnValue = ""; } };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [guard]);
  useEffect(() => { const dialog = ref.current; if (docked) dialog?.show(); else dialog?.showModal(); return () => dialog?.close(); }, [docked]);
  // A non-modal dialog does not close on Escape by itself.
  useEffect(() => { if (!docked) return; const key = (event: KeyboardEvent) => { if (event.key === "Escape") close(); }; window.addEventListener("keydown", key); return () => window.removeEventListener("keydown", key); }, [docked, close]);
  return <dialog ref={ref} className={`${s.modal} ${wide ? s.wideModal : ""} ${docked ? s.dockedModal : ""} ${className}`} onInputCapture={() => { dirty.current = true; }} onChangeCapture={() => { dirty.current = true; }} onCancel={event => { event.preventDefault(); dismiss(); }} aria-labelledby={titleId} onClick={e => { if (e.target === e.currentTarget) dismiss(); }}><header className={s.modalHead}><div><h2 id={titleId}>{title}</h2>{subtitle && <p>{subtitle}</p>}</div><button type="button" className={s.iconButton} onClick={dismiss} aria-label="Close dialog"><X size={20} /></button></header>{children}</dialog>;
}
