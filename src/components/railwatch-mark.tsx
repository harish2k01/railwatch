/**
 * Renders the RailWatch signal lamp mark: a solid signal head with a lit top lens, a dimmed
 * lower lens, and a stem on a base. The body uses currentColor; the lenses use --rw-mark-lamp
 * (brand by default) so the mark reads on plain surfaces and on brand-coloured tiles.
 */
const L="var(--rw-mark-lamp, var(--rw-brand, #4c4ddc))";
export function RailWatchMark({size=28}:{size?:number}){return <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true"><rect x="16" y="6" width="16" height="28" rx="8" fill="currentColor"/><circle cx="24" cy="14" r="4.2" fill={L}/><circle cx="24" cy="26" r="4.2" fill={L} opacity=".35"/><rect x="22.5" y="34" width="3" height="8" rx="1.5" fill="currentColor"/><rect x="15" y="41" width="18" height="3" rx="1.5" fill="currentColor"/></svg>;}
