import type { ReactNode } from "react";
import s from "./empty-state.module.css";

export type EmptyArt = "journeys" | "search" | "calendar" | "tickets" | "bell" | "routine" | "spend" | "done";

/** The small mark drawn over the track in each illustration. */
function Glyph({ art }: { art: EmptyArt }) {
  switch (art) {
    case "search": return <g className={s.accent}><circle cx="118" cy="44" r="16" fill="none" strokeWidth="5" /><path d="M130 56l12 12" strokeWidth="6" strokeLinecap="round" /></g>;
    case "calendar": return <g className={s.accent}><rect x="100" y="28" width="40" height="36" rx="7" fill="none" strokeWidth="4" /><path d="M100 40h40M110 22v10M130 22v10" strokeWidth="4" strokeLinecap="round" /></g>;
    case "tickets": return <g className={s.accent}><path d="M98 32h44v10a6 6 0 0 0 0 12v10H98V54a6 6 0 0 0 0-12z" fill="none" strokeWidth="4" strokeLinejoin="round" /><path d="M120 34v28" strokeWidth="3" strokeDasharray="4 4" /></g>;
    case "bell": return <g className={s.accent}><path d="M106 58V46a14 14 0 0 1 28 0v12l5 6h-38z" fill="none" strokeWidth="4" strokeLinejoin="round" /><path d="M115 68a5 5 0 0 0 10 0" strokeWidth="4" strokeLinecap="round" fill="none" /></g>;
    case "routine": return <g className={s.accent}><path d="M104 48a16 16 0 0 1 28-10M136 48a16 16 0 0 1-28 10" fill="none" strokeWidth="4" strokeLinecap="round" /><path d="M132 30v9h-9M108 66v-9h9" fill="none" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" /></g>;
    case "spend": return <g className={s.accent}><path d="M104 66V52M116 66V40M128 66V46M140 66V30" strokeWidth="7" strokeLinecap="round" /></g>;
    case "done": return <g className={s.accent}><circle cx="120" cy="46" r="20" fill="none" strokeWidth="4" /><path d="M111 46l6 6 12-13" fill="none" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" /></g>;
    default: return <g className={s.accent}><circle cx="120" cy="46" r="7" /><path d="M120 53v12" strokeWidth="4" strokeLinecap="round" /></g>;
  }
}

/**
 * Empty state with a light line illustration (a train on a track, with a mark for the context) instead of a blank
 * area: no journeys, no search results, nothing to do, no tickets and so on.
 */
export function EmptyState({ art = "journeys", title, children, action, compact = false }: { art?: EmptyArt; title: string; children?: ReactNode; action?: ReactNode; compact?: boolean }) {
  return <div className={s.empty} data-compact={compact || undefined} role="status">
    <svg className={s.art} viewBox="0 0 240 110" aria-hidden="true" fill="currentColor" stroke="currentColor">
      <ellipse className={s.glow} cx="120" cy="92" rx="104" ry="12" stroke="none" />
      <path className={s.rail} d="M12 92h216" strokeWidth="3" strokeLinecap="round" fill="none" />
      <path className={s.sleepers} d="M24 96v-8M48 96v-8M72 96v-8M96 96v-8M144 96v-8M168 96v-8M192 96v-8M216 96v-8" strokeWidth="3" strokeLinecap="round" fill="none" />
      <g className={s.train}>
        <rect x="34" y="62" width="52" height="24" rx="8" stroke="none" />
        <rect x="42" y="68" width="12" height="8" rx="2" className={s.window} stroke="none" />
        <rect x="60" y="68" width="12" height="8" rx="2" className={s.window} stroke="none" />
        <circle cx="46" cy="88" r="4" className={s.wheel} stroke="none" /><circle cx="74" cy="88" r="4" className={s.wheel} stroke="none" />
      </g>
      <Glyph art={art} />
    </svg>
    <strong>{title}</strong>
    {children && <p>{children}</p>}
    {action}
  </div>;
}
