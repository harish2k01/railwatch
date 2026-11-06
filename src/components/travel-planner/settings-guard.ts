"use client";
import { useEffect, useRef } from "react";
import { ask } from "./confirm";

const DISCARD = "Discard your unsaved changes?";

/**
 * Tracks edited settings forms in memory and guards dismissal, links, history and reloads.
 * Every prompt uses the app's own confirm dialog; the browser's leave-page warning is only used for
 * reloads and closing the tab, which browsers don't let pages restyle.
 */
export function useSettingsGuard() {
  const destination = useRef<{ url: string; state: unknown } | undefined>(undefined);
  const dirty = useRef(new Set<HTMLFormElement>());
  /** Records edits only in a form, ignoring search and other transient controls. */
  function changed(event: { target: EventTarget | null }) {
    const form = event.target instanceof Element ? event.target.closest("form") : null;
    if (form) { if (!dirty.current.size) destination.current = { url: location.href, state: history.state }; dirty.current.add(form); }
  }
  /** Clears only a successfully saved form; other settings edits remain protected. */
  function saved(form: HTMLFormElement) { dirty.current.delete(form); }
  /** Runs the action now when nothing is edited; otherwise asks first and runs it only after Discard. */
  function proceed(action: () => void) {
    if (!dirty.current.size) { action(); return; }
    void ask(DISCARD).then(ok => { if (ok) { dirty.current.clear(); action(); } });
  }
  /** True when there is nothing to lose. When there are edits, asks and runs `then` after Discard. */
  function discard(then?: () => void) {
    if (!dirty.current.size) return true;
    void ask(DISCARD).then(ok => { if (ok) { dirty.current.clear(); then?.(); } });
    return false;
  }
  useEffect(() => {
    const forms = dirty.current;
    const unload = (event: BeforeUnloadEvent) => { if (forms.size) { event.preventDefault(); event.returnValue = ""; } };
    /** Holds a client-side link while asking; a confirmed discard repeats the click. */
    const link = (event: MouseEvent) => {
      const anchor = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!anchor || event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || anchor.getAttribute("target") === "_blank" || !forms.size) return;
      event.preventDefault(); event.stopPropagation();
      void ask(DISCARD).then(ok => { if (ok) { forms.clear(); (anchor as HTMLElement).click(); } });
    };
    /** Keeps the current settings screen on Back; a confirmed discard goes back again. */
    const back = (event: PopStateEvent) => {
      if (!forms.size || !destination.current) return;
      event.stopImmediatePropagation();
      history.pushState(destination.current.state, "", destination.current.url);
      void ask(DISCARD).then(ok => { if (ok) { forms.clear(); history.back(); } });
    };
    /** Workspace buttons (sidebar, More, section switches) ask before they unmount edited settings. */
    const navigate = (event: Event) => {
      if (event.defaultPrevented || !forms.size) return;
      event.preventDefault();
      const retry = (event as CustomEvent<{ retry?: () => void }>).detail?.retry;
      void ask(DISCARD).then(ok => { if (ok) { forms.clear(); retry?.(); } });
    };
    const accepted = () => forms.clear();
    window.addEventListener("railwatch:navigate", navigate);
    window.addEventListener("railwatch:navigation-accepted", accepted);
    window.addEventListener("popstate", back, true);
    window.addEventListener("beforeunload", unload);
    document.addEventListener("click", link, true);
    return () => { window.removeEventListener("railwatch:navigate", navigate); window.removeEventListener("railwatch:navigation-accepted", accepted); window.removeEventListener("popstate", back, true); window.removeEventListener("beforeunload", unload); document.removeEventListener("click", link, true); };
  }, []);
  return { changed, saved, discard, proceed };
}

/**
 * Lets settings editors veto a workspace navigation. Returns true when it may happen now; when edits are open,
 * returns false and, if the person chooses Discard, runs `retry`.
 */
export function settingsNavigationAllowed(retry?: () => void) {
  const allowed = window.dispatchEvent(new CustomEvent("railwatch:navigate", { cancelable: true, detail: { retry } }));
  if (allowed) window.dispatchEvent(new Event("railwatch:navigation-accepted"));
  return allowed;
}
