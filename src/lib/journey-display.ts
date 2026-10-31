import { addDays, type Planner } from "./travel-planner";

/** Shows an imported station code when present without changing the saved ticket text. */
export function stationLabel(value: string): string {
  return value.match(/\s[-–]\s*([A-Z]{2,5})\s*$/)?.[1] ?? value;
}

/** Groups adjacent dates with the same leave name/type while preserving each stored day. */
export function groupTimeOff(holidays: Planner["holidays"]) {
  const groups: { start: string; end: string; name: string; type: Planner["holidays"][number]["type"]; days: Planner["holidays"] }[] = [];
  for (const day of [...holidays].sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name))) {
    const previous = groups.findLast(group => group.name === day.name && group.type === day.type && addDays(group.end, 1) === day.date);
    if (previous) { previous.end = day.date; previous.days.push(day); }
    else groups.push({ start: day.date, end: day.date, name: day.name, type: day.type, days: [day] });
  }
  return groups.sort((a, b) => a.start.localeCompare(b.start));
}

/** Keeps ranges spanning today intact and sorts past ranges most recent first. */
export function timeOffGroups(holidays: Planner["holidays"], today: string, past: boolean) {
  return groupTimeOff(holidays).filter(group => past ? group.end < today : group.end >= today)
    .sort((a, b) => past ? b.end.localeCompare(a.end) : a.start.localeCompare(b.start));
}
