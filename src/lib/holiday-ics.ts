import { addDays, holidaySchema, type Holiday } from "./travel-planner";

/** Unescapes an iCalendar TEXT value. */
const unescape = (value: string) => value.replace(/\\n/gi, " ").replace(/\\([,;\\])/g, "$1").trim();
/** Reads YYYYMMDD from a DATE or DATE-TIME value. */
const day = (value: string) => { const m = value.match(/^(\d{4})(\d{2})(\d{2})/); return m ? `${m[1]}-${m[2]}-${m[3]}` : ""; };

/**
 * Parses all-day VEVENTs from an iCalendar file into holidays (plan 3.8). Multi-day events expand
 * to one holiday per day (DTEND is exclusive); timed events are skipped; at most 3,000 days.
 */
export function parseHolidayICS(text: string, type: Holiday["type"] = "company"): Omit<Holiday, "id">[] {
  if (!/BEGIN:VCALENDAR/i.test(text)) throw new Error("This doesn't look like a calendar (.ics) file.");
  // RFC 5545 line folding: a CRLF followed by a space or tab continues the previous line.
  const lines = text.replace(/\r\n?/g, "\n").replace(/\n[ \t]/g, "").split("\n");
  const out: Omit<Holiday, "id">[] = [];
  let event: Record<string, string> | null = null;
  for (const line of lines) {
    if (/^BEGIN:VEVENT$/i.test(line)) { event = {}; continue; }
    if (/^END:VEVENT$/i.test(line) && event) {
      const allDay = /VALUE=DATE(?!-)/i.test(event.DTSTART_PARAMS ?? "") || /^\d{8}$/.test(event.DTSTART ?? "");
      const start = day(event.DTSTART ?? ""), name = unescape(event.SUMMARY ?? "").slice(0, 100);
      if (allDay && start && name) {
        const end = day(event.DTEND ?? "") || addDays(start, 1);
        for (let d = start; d < end && out.length < 3000; d = addDays(d, 1)) {
          const parsed = holidaySchema.safeParse({ id: "import", date: d, name, type });
          if (parsed.success) out.push({ date: parsed.data.date, name: parsed.data.name, type: parsed.data.type });
        }
      }
      event = null; continue;
    }
    if (!event) continue;
    const m = line.match(/^([A-Z-]+)((?:;[^:]*)?):(.*)$/i);
    if (m) { const key = m[1].toUpperCase(); event[key] = m[3]; if (m[2]) event[`${key}_PARAMS`] = m[2]; }
  }
  if (!out.length) throw new Error("No all-day events were found in this calendar.");
  return out;
}
