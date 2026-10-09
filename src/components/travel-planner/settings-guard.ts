"use client";
import { useEffect, useRef } from "react";

const blocked = new WeakSet<Event>();

/** Tracks edited settings forms in memory and guards dismissal, links, and reloads. */
export function useSettingsGuard() {
  const destination = useRef<{url:string;state:unknown}|undefined>(undefined);
  const dirty = useRef(new Set<HTMLFormElement>());
  /** Records edits only in a form, ignoring search and other transient controls. */
  function changed(event: { target: EventTarget | null }) {
    const form = event.target instanceof Element ? event.target.closest("form") : null;
    if (form) { if(!dirty.current.size)destination.current={url:location.href,state:history.state};dirty.current.add(form); }
  }
  /** Clears only a successfully saved form; other settings edits remain protected. */
  function saved(form: HTMLFormElement) { dirty.current.delete(form); }
  /** Checks consent without clearing edits while another settings editor may still veto navigation. */
  function approved() { return !dirty.current.size || window.confirm("Discard your unsaved changes?"); }
  /** Requires deliberate dismissal before throwing away form edits. */
  function discard() {
    if (approved()) { dirty.current.clear(); return true; }
    return false;
  }
  useEffect(() => {
    const forms = dirty.current;
    /** Warns before a document navigation without persisting sensitive field values. */
    const unload = (event: BeforeUnloadEvent) => { if (forms.size) { event.preventDefault(); event.returnValue = ""; } };
    /** Stops client-side links before Next.js navigation when settings have edits. */
    const link = (event: MouseEvent) => {
      const anchor = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!anchor || event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || anchor.getAttribute("target") === "_blank" || !forms.size) return;
      if (!approved()) { blocked.add(event); event.preventDefault(); event.stopPropagation(); }
      else queueMicrotask(() => { if (!blocked.has(event)) forms.clear(); });
    };
    /** Keeps the current settings screen when a browser-history dismissal is declined. */
    const back = (event: PopStateEvent) => {
      if (!forms.size) return;
      if (!approved() && destination.current) {
        blocked.add(event);
        event.stopImmediatePropagation();
        history.pushState(destination.current.state, "", destination.current.url);
      }
      else queueMicrotask(() => { if (!blocked.has(event)) forms.clear(); });
    };
    /** Guards programmatic workspace buttons as well as ordinary links. */
    const navigate = (event: Event) => { if(!event.defaultPrevented && forms.size && !approved()) event.preventDefault(); };
    /** Clears discarded edits only after every active settings editor has accepted navigation. */
    const accepted = () => forms.clear();
    window.addEventListener("railwatch:navigate", navigate);
    window.addEventListener("railwatch:navigation-accepted", accepted);
    window.addEventListener("popstate", back, true);
    window.addEventListener("beforeunload", unload);
    document.addEventListener("click", link, true);
    return () => { window.removeEventListener("railwatch:navigate",navigate);window.removeEventListener("railwatch:navigation-accepted",accepted);window.removeEventListener("popstate",back,true);window.removeEventListener("beforeunload", unload); document.removeEventListener("click", link, true); };
  }, []);
  return { changed, saved, discard };
}

/** Allows settings editors to veto workspace buttons before they unmount. */
export function settingsNavigationAllowed() {
  const allowed = window.dispatchEvent(new Event("railwatch:navigate",{cancelable:true}));
  if (allowed) window.dispatchEvent(new Event("railwatch:navigation-accepted"));
  return allowed;
}
