import type { TicketDetails } from "./ticket-details";
import { parseFare } from "./ticket-fare";

/**
 * IRCTC booking-confirmation emails (from ticketadmin@irctc.co.in) carry no PDF: the ticket is an HTML table of
 * "Label :" / value cells, a passenger table and a fare table. These helpers turn that mail into ticket details.
 */

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const CLASSES: [RegExp, string][] = [
  [/SLEEPER/i, "SL"], [/(FIRST\s*AC|AC\s*FIRST|1A\b)/i, "1A"], [/(AC\s*2\s*TIER|SECOND\s*AC|2A\b)/i, "2A"],
  [/(AC\s*3\s*ECONOMY|3E\b)/i, "3E"], [/(AC\s*3\s*TIER|THIRD\s*AC|3A\b)/i, "3A"], [/EXEC/i, "EC"],
  [/(AC\s*CHAIR|CHAIR\s*CAR|\bCC\b)/i, "CC"], [/(SECOND\s*SITTING|2S\b)/i, "2S"],
];

/** Converts email HTML to text with table cells separated by tabs and rows by newlines. */
export function emailText(html: string): string {
  // Plain text for parsing only (never rendered): cells → tabs, rows → newlines, every tag and angle bracket removed.
  let text = html;
  // Drop <head>/<style>/<script> contents by position (no regex over tags), so CSS or script text is not parsed.
  for (const name of ["head", "style", "script"]) {
    for (let lower = text.toLowerCase(), start = lower.indexOf(`<${name}`); start >= 0; lower = text.toLowerCase(), start = lower.indexOf(`<${name}`)) {
      const close = lower.indexOf(`</${name}`, start); const end = close < 0 ? text.length : (lower.indexOf(">", close) + 1 || text.length);
      text = text.slice(0, start) + text.slice(end);
    }
  }
  // Scan characters: nothing between "<" and ">" is kept; cell ends become tabs and row/block ends newlines.
  let out = "", tag: string | undefined;
  for (const ch of text) {
    if (tag === undefined) { if (ch === "<") tag = ""; else out += ch === ">" ? " " : ch; continue; }
    if (ch !== ">") { tag += ch; continue; }
    const t = tag.trim().toLowerCase(); tag = undefined;
    out += /^\/(td|th)\b/.test(t) ? "\t" : /^(br|\/tr|\/p|\/div|\/h\d|\/li)\b/.test(t) ? "\n" : "";
  }
  return out
    .replace(/&nbsp;/g, " ").replace(/&#(\d+);/g, (_, n) => { const c = Number(n); return c === 60 || c === 62 || c === 38 ? " " : String.fromCharCode(c); }).replace(/&(lt|gt);/g, " ").replace(/&amp;/g, "&")
    .replace(/[  ]+/g, " ").replace(/ ?\t ?/g, "\t").replace(/\n\s*\n+/g, "\n").trim();
}

/** True when the subject/sender look like an IRCTC booking confirmation. */
export function isTicketEmail(from: string, subject: string) {
  return /@irctc\.co\.in\b/i.test(from) && /booking\s+confirmation/i.test(subject);
}

const code = (value?: string) => value?.match(/\(\s*([A-Z]{1,5})\s*\)/)?.[1] ?? (/^[A-Z]{1,5}$/.test(value?.trim() ?? "") ? value!.trim() : undefined);

/** Reads ticket details from the text of an IRCTC booking email (see `emailText`). */
export function parseTicketEmail(raw: string): TicketDetails {
  const text = raw.replace(/\r/g, "");
  const cells = text.split(/[\t\n]/).map(c => c.trim()).filter(Boolean);
  const field = (label: RegExp) => { const i = cells.findIndex(c => label.test(c)); const v = i >= 0 ? cells[i + 1] : undefined; return v && !/:\s*$/.test(v) ? v : undefined; };
  const details: TicketDetails = {};
  const pnr = field(/^PNR\s*No\.?\s*:?$/i)?.match(/\d{10}/)?.[0]; if (pnr) details.pnr = pnr;
  const train = field(/^Train\s*No\.?\s*\/\s*Name\s*:?$/i)?.match(/(\d{5})\s*\/\s*(.+)/); if (train) { details.trainNumber = train[1]; details.trainName = train[2].trim().slice(0, 100); }
  const date = field(/^Date\s*of\s*Journey\s*:?$/i)?.match(/(\d{1,2})-([A-Za-z]{3})-(\d{4})/);
  if (date) { const m = MONTHS.indexOf(date[2].toLowerCase()); if (m >= 0) details.date = `${date[3]}-${String(m + 1).padStart(2, "0")}-${date[1].padStart(2, "0")}`; }
  const from = code(field(/^Boarding\s*At\s*:?$/i)) ?? code(field(/^From\s*:?$/i)); if (from) details.from = from;
  const to = code(field(/^Reservation\s*Up\s*to\s*:?$/i)) ?? code(field(/^To\s*:?$/i)); if (to) details.to = to;
  const cls = field(/^Class\s*:?$/i); const travelClass = cls && CLASSES.find(([re]) => re.test(cls))?.[1]; if (travelClass) details.travelClass = travelClass;
  const quota = field(/^Quota\s*:?$/i); if (quota) details.bookingType = /TATKAL/i.test(quota) ? "tatkal" : "normal";
  const dep = field(/^Scheduled\s*Departure\*?\s*:?$/i)?.match(/\b([01]\d|2[0-3]):([0-5]\d)\b/); if (dep) details.departure = `${dep[1]}:${dep[2]}`;
  // Passenger table: the first row after the header ("Sl. No. Name Age Gender … Status Coach Seat / Berth / WL No").
  const lines = text.split("\n");
  const head = lines.findIndex(l => /Sl\.?\s*No/i.test(l) && /Status/i.test(l));
  if (head >= 0 && lines[head + 1]) {
    const cols = lines[head].split("\t").map(c => c.trim()), row = lines[head + 1].split("\t").map(c => c.trim());
    const at = (re: RegExp) => { const i = cols.findIndex(c => re.test(c)); return i >= 0 ? row[i] : undefined; };
    const status = at(/^Status$/i)?.toUpperCase(), coach = at(/^Coach$/i), seat = at(/Seat|Berth/i);
    if (status) { const s = status.match(/^(CNF|RAC|WL|GNWL|PQWL|RLWL|TQWL|RSWL)/)?.[1]; if (s) details.ticketStatus = s === "CNF" ? "CNF" : s === "RAC" ? "RAC" : "WL"; }
    if (coach && /^[A-Z0-9]{1,5}$/i.test(coach) && coach !== "-") details.coach = coach.toUpperCase();
    const berth = seat?.match(/^(\d{1,3})(?:\s*\/?\s*([A-Z ]+))?$/i); if (berth) { details.seat = berth[1]; if (berth[2]?.trim()) details.berth = berth[2].trim().toUpperCase(); }
  }
  const fare = parseFare(text); if (fare) details.fare = fare;
  return details;
}
