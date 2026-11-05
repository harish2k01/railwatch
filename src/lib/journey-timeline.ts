import { addDays, formatDay, weekday, type Journey, type Rule } from "./travel-planner";

/** Journeys grouped for the timeline: one-off trips by week, routine trips under their routine. */
export type JourneyTimeline = { weeks: { label: string; journeys: Journey[] }[]; routines: { id: string; name: string; journeys: Journey[] }[] };

/** Monday-based start of the week containing `day`. */
const weekStart = (day: string) => addDays(day, -((weekday(day) + 6) % 7));

/** Names a week relative to today: This week, Next week, Week of 23 Nov, or Later in December. */
function weekLabel(day: string, today: string) {
  const start = weekStart(day), current = weekStart(today);
  if (start === current) return "This week";
  if (start === addDays(current, 7)) return "Next week";
  if (start < current) return `Week of ${formatDay(start, { day: "numeric", month: "short" })}`;
  return start.slice(0, 7) === current.slice(0, 7) || start <= addDays(current, 28) ? `Week of ${formatDay(start, { day: "numeric", month: "short" })}` : `Later in ${formatDay(day, { month: "long", year: day.slice(0, 4) === today.slice(0, 4) ? undefined : "numeric" })}`;
}

/** Groups rows (already sorted and filtered by the server) without reordering them. */
export function journeyTimeline(rows: Journey[], today: string, rules: Rule[]): JourneyTimeline {
  const names = new Map(rules.map((r) => [r.id, r.name]));
  const weeks: JourneyTimeline["weeks"] = [], routines = new Map<string, JourneyTimeline["routines"][number]>();
  for (const j of rows) {
    const rule = j.ruleId && names.get(j.ruleId);
    if (rule && j.ruleId) {
      const group = routines.get(j.ruleId) ?? { id: j.ruleId, name: rule, journeys: [] };
      group.journeys.push(j); routines.set(j.ruleId, group); continue;
    }
    const label = weekLabel(j.date, today), last = weeks.at(-1);
    if (last?.label === label) last.journeys.push(j); else weeks.push({ label, journeys: [j] });
  }
  return { weeks, routines: [...routines.values()] };
}
