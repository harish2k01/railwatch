/**
 * Reads a PNR status the user shared from the official enquiry page (copied text, or OCR of a screenshot): the PNR,
 * each passenger's current status (CNF/S5/32/LB, RAC 12, WL 4, CAN) and whether the chart is prepared.
 * Nothing here fetches anything: the user looks the PNR up themselves and shares the result.
 */
export type SharedPnrPassenger = { status: "CNF" | "RAC" | "WL" | "CAN"; coach?: string; berth?: string; berthType?: string; position?: number };
export type SharedPnr = { pnr?: string; passengers: SharedPnrPassenger[]; chartPrepared?: boolean };

const BERTH_TYPES = new Set(["LB", "MB", "UB", "SL", "SU", "SM", "WS", "MS", "AS", "NC", "CB", "CP"]);

/** One status cell: "CNF/S5/32/LB", "CNF S5 32 LB", "RAC/S2/41", "RLWL/12", "WL 4", "CAN". */
function readStatus(cell: string): SharedPnrPassenger | undefined {
  const parts = cell.toUpperCase().replace(/[,]/g, " ").split(/[\s/]+/).filter(Boolean);
  const head = parts[0];
  if (!head) return undefined;
  if (/^(CAN|CANCELLED|CANCELED)$/.test(head)) return { status: "CAN" };
  if (/^(CNF|CONFIRMED|RAC|[A-Z]*WL)$/.test(head)) {
    const status = head.startsWith("RAC") ? "RAC" : head.endsWith("WL") ? "WL" : "CNF";
    const coach = parts.find(p => /^[A-Z]{1,3}\d{1,2}$/.test(p));
    const numbers = parts.filter(p => /^\d{1,3}$/.test(p)).map(Number);
    const berthType = parts.find(p => BERTH_TYPES.has(p));
    if (status === "WL") return { status, position: numbers[0] };
    return { status, coach, berth: numbers[0] !== undefined ? String(numbers[0]) : undefined, berthType, ...(status === "RAC" && !coach && numbers[0] !== undefined ? { position: numbers[0], berth: undefined } : {}) };
  }
  return undefined;
}

/** Parses shared PNR text. Uses the "Current Status" column when the booking and current status are both present. */
export function parseSharedPnr(raw: string): SharedPnr {
  const text = raw.replace(/\r/g, "");
  const pnr = text.match(/PNR(?:\s*(?:No\.?|Number))?\s*[:\-]?\s*(\d{10})\b/i)?.[1] ?? text.match(/\b(\d{10})\b/)?.[1];
  const chart = text.match(/Chart(?:ing)?\s*Status\s*[:\-]?\s*([^\n]+)/i)?.[1] ?? text.match(/Chart\s+(Not\s+)?Prepared/i)?.[0];
  const chartPrepared = chart === undefined ? undefined : !/not/i.test(chart) && /prepared/i.test(chart);
  const passengers: SharedPnrPassenger[] = [];
  for (const line of text.split("\n")) {
    if (!/passenger|^\s*\d+\s|^\s*(CNF|RAC|[A-Z]*WL|CAN)/i.test(line)) continue;
    // A passenger row lists the booking status then the current status; the last one is current.
    const cells = [...line.toUpperCase().matchAll(/\b(?:CNF|CONFIRMED|RAC|[A-Z]{0,4}WL|CAN|CANCELLED)\b[^\t\n]*?(?=\s+\b(?:CNF|CONFIRMED|RAC|[A-Z]{0,4}WL|CAN|CANCELLED)\b|\t|$)/g)].map(m => m[0].trim());
    const current = cells.length ? readStatus(cells[cells.length - 1]) : undefined;
    if (current) passengers.push(current);
  }
  return { pnr, passengers, chartPrepared };
}

/** Overall status for the journey: CAN only if every passenger is cancelled; otherwise the least certain status. */
export function sharedPnrSummary(p: SharedPnr): "CNF" | "RAC" | "WL" | "CAN" | undefined {
  if (!p.passengers.length) return undefined;
  if (p.passengers.every(x => x.status === "CAN")) return "CAN";
  const live = p.passengers.filter(x => x.status !== "CAN");
  return live.some(x => x.status === "WL") ? "WL" : live.some(x => x.status === "RAC") ? "RAC" : "CNF";
}
