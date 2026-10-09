"use client";
import { useEffect, useRef } from "react";

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
  /** Requires deliberate dismissal before throwing away form edits. */
  function discard() {
    if (!dirty.current.size || window.confirm("Discard your unsaved changes?")) { dirty.current.clear(); return true; }
    return false;
  }
  useEffect(() => {
    const forms = dirty.current;
    /** Warns before a document navigation without persisting sensitive field values. */
    const unload = (event: BeforeUnloadEvent) => { if (forms.size) { event.preventDefault(); event.returnValue = ""; } };
    /** Stops client-side links before Next.js navigation when settings have edits. */
    const link = (event: MouseEvent) => {
      const anchor = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (anchor && forms.size && !discard()) { event.preventDefault(); event.stopPropagation(); }
    };
    /** Keeps the current settings screen when a browser-history dismissal is declined. */
    const back = (event: PopStateEvent) => {
      if (forms.size && !discard() && destination.current) {
        event.stopImmediatePropagation();
        history.pushState(destination.current.state, "", destination.current.url);
      }
    };
    /** Guards programmatic workspace buttons as well as ordinary links. */
    const navigate = (event: Event) => { if(forms.size && !discard()) event.preventDefault(); };
    window.addEventListener("railwatch:navigate", navigate);
    window.addEventListener("popstate", back, true);
    window.addEventListener("beforeunload", unload);
    document.addEventListener("click", link, true);
    return () => { window.removeEventListener("railwatch:navigate",navigate);window.removeEventListener("popstate",back,true);window.removeEventListener("beforeunload", unload); document.removeEventListener("click", link, true); };
  }, []);
  return { changed, saved, discard };
}

/** Allows settings editors to veto workspace buttons before they unmount. */
export function settingsNavigationAllowed() { return window.dispatchEvent(new Event("railwatch:navigate",{cancelable:true})); }
