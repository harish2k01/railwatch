"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, CircleAlert, X } from "lucide-react";
import s from "./planner.module.css";

/** Shows dismissible feedback (bottom right on desktop, centred above the tab bar on phones), including inside native dialogs. */
export function Toast({ message, dismiss, undo, error = false, action }: { message: string; dismiss: () => void; undo?: () => void; error?: boolean; action?: { label: string; run: () => void } }) {
  const surface = useRef<HTMLDivElement>(null);
  const [host,setHost]=useState<HTMLDialogElement|null>(null);
  useEffect(()=>{const timer=setTimeout(()=>setHost(document.querySelector<HTMLDialogElement>("dialog[open]")),0);return()=>clearTimeout(timer);},[]);
  useEffect(() => { const timer = setTimeout(() => {document.querySelectorAll<HTMLElement>("[data-railwatch-toast]:popover-open").forEach(toast=>toast.hidePopover());surface.current?.showPopover();}, 0); return () => clearTimeout(timer); }, [host]);
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (paused) return;
    const timer = setTimeout(dismiss, undo ? 8000 : error ? 9000 : 4500);
    return () => clearTimeout(timer);
  }, [dismiss, paused, undo, error]);
  const content = <div ref={surface} data-railwatch-toast popover="manual" className={`${s.toast} ${error ? s.toastError : ""}`} role={error ? "alert" : "status"} aria-atomic="true" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onFocus={() => setPaused(true)} onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget)) setPaused(false); }}>
    <span className={s.toastIcon}>{error ? <CircleAlert size={19} /> : <Check size={19} />}</span><p>{message}</p>
    {undo && <button className={s.textButton} onClick={undo}>Undo</button>}{action && <button className={s.textButton} onClick={() => { action.run(); dismiss(); }}>{action.label}</button>}
    <button className={s.iconButton} onClick={dismiss} aria-label="Dismiss notification"><X size={17} /></button>
  </div>;
  return host?createPortal(content,host):content;
}
