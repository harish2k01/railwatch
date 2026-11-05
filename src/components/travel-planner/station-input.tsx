"use client";
import { useEffect, useId, useState, type InputHTMLAttributes } from "react";
import { loadStations, searchStations, type Station } from "@/lib/stations";

/** Station text field suggesting codes from the bundled directory, ranked by the user's recent stations. */
export function StationInput({ recent = [], ...props }: { recent?: readonly string[] } & Omit<InputHTMLAttributes<HTMLInputElement>, "list">) {
  const id = useId(), [query, setQuery] = useState(String(props.defaultValue ?? "")), [all, setAll] = useState<readonly Station[]>([]);
  useEffect(() => { let live = true; void loadStations().then((s) => { if (live) setAll(s); }); return () => { live = false; }; }, []);
  const options = searchStations(all, query, recent);
  return <>
    <input {...props} list={id} autoComplete="off" spellCheck={false} onFocus={(e) => { setQuery(e.currentTarget.value); props.onFocus?.(e); }} onInput={(e) => { setQuery(e.currentTarget.value); props.onInput?.(e); }} />
    <datalist id={id}>{options.map(([code, name]) => <option key={code} value={code}>{name ? `${name} (${code})` : code}</option>)}</datalist>
  </>;
}
