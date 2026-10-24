"use client";
import { useEffect, useRef, useState } from "react";
import { MoreHorizontal } from "lucide-react";
import s from "./planner.module.css";
type Action = { label: string; onClick: () => void; disabled?: boolean; danger?: boolean };
/** Provides keyboard-accessible secondary and destructive actions behind a single overflow button. */
export function ActionMenu({ label, actions, disabled = false }: { label: string; actions: Action[]; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [placement,setPlacement]=useState({below:false,left:false,maxHeight:320});
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    root.current?.querySelector<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')?.focus({preventScroll:true});
    const /** Dismisses the menu when a pointer event occurs outside it. */ outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);
  return <div ref={root} className={s.actionMenu} onKeyDown={event => {
    if (event.key === "Escape") { setOpen(false); trigger.current?.focus(); }
    if (event.key === "Tab") setOpen(false);
    if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key) && open) {
      event.preventDefault();
      const items = Array.from(root.current!.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)'));
      const current = items.indexOf(document.activeElement as HTMLButtonElement);
      items[event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : (current + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus();
    }
  }}>
    <button ref={trigger} type="button" className={s.secondary} aria-label={label} aria-haspopup="menu" aria-expanded={open} disabled={disabled} onClick={() => {const box=trigger.current!.getBoundingClientRect(),above=box.top-16,below=innerHeight-box.bottom-16,down=below>=Math.min(actions.length*44+12,320)||below>above;setPlacement({below:down,left:box.right<226,maxHeight:Math.max(80,down?below:above)});setOpen(!open);}}><MoreHorizontal size={18}/></button>
    {open && <div role="menu" aria-label={label} className={s.actionMenuItems} style={{top:placement.below?"calc(100% + 8px)":"auto",bottom:placement.below?"auto":"calc(100% + 8px)",left:placement.left?0:"auto",right:placement.left?"auto":0,maxHeight:placement.maxHeight,overflowY:"auto"}}>{actions.map(action => <button key={action.label} type="button" role="menuitem" className={action.danger ? s.dangerAction : undefined} disabled={action.disabled} onClick={() => { setOpen(false); trigger.current?.focus({preventScroll:true}); action.onClick(); }}>{action.label}</button>)}</div>}
  </div>;
}
