"use client";
import { ask } from "./confirm";
import {cloneElement,createContext,useContext,useEffect,useId,useRef,useState,type ReactElement,type ReactNode} from "react";
import {createPortal} from "react-dom";
import {X} from "lucide-react";
import s from "./planner.module.css";
/** Associates a form control with its generated label and optional help text. */
export function Field({ label, children, hint }: { label: string; children: ReactElement; hint?: string }) {
  const id = useId();
  return <div className={s.field}><label htmlFor={id}>{label}</label>{cloneElement(children as ReactElement<{ id: string; "aria-describedby"?: string }>, { id, "aria-describedby": hint ? `${id}-hint` : undefined })}{hint && <small id={`${id}-hint`}>{hint}</small>}</div>;
}
const HeaderSlot=createContext<HTMLElement|null>(null);
/** Renders actions (such as a ⋯ menu) in the enclosing dialog's header, beside its close button; inline elsewhere. */
export function ModalActions({children}:{children:ReactNode}){const slot=useContext(HeaderSlot);return slot?createPortal(children,slot):<>{children}</>;}
/** Opens an accessible item dialog and closes it when dismissed or unmounted. */
/** A dialog; `docked` shows it as a non-modal side panel beside the page (journey details on desktop). */
export function Modal({ title, subtitle, children, close, wide = false, guard = false, className = "", docked = false }: { title: string; subtitle?: string; children: ReactNode; close: () => void; wide?: boolean; guard?: boolean; className?:string; docked?: boolean }) {
  const titleId=useId();const [slot,setSlot]=useState<HTMLElement|null>(null);const ref = useRef<HTMLDialogElement>(null);
  const dirty = useRef(false);
  /** Preserves form edits when a dialog is dismissed accidentally. */
  async function dismiss() { if (!guard || !dirty.current || await ask("Discard your unsaved changes?")) close(); }
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
  return <dialog ref={ref} data-docked={docked || undefined} className={`${s.modal} ${wide ? s.wideModal : ""} ${docked ? s.dockedModal : ""} ${className}`} onInputCapture={() => { dirty.current = true; }} onChangeCapture={() => { dirty.current = true; }} onCancel={event => { event.preventDefault(); dismiss(); }} aria-labelledby={titleId} onClick={e => { if (e.target === e.currentTarget) dismiss(); }}><header className={s.modalHead}><div><h2 id={titleId}>{title}</h2>{subtitle && <p>{subtitle}</p>}</div><div className={s.modalTools}><span ref={setSlot} className={s.modalSlot}/><button type="button" className={s.iconButton} onClick={dismiss} aria-label="Close dialog"><X size={20} /></button></div></header><HeaderSlot.Provider value={slot}>{children}</HeaderSlot.Provider></dialog>;
}
