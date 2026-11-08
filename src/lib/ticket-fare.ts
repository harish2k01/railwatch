/** Fare breakdown read from an IRCTC ticket (ERS PDF, its OCR text, or the booking-confirmation email). */
export type Fare = { total: number; ticket?: number; convenience?: number; wallet?: number; insurance?: number };

const near = (a: number, b: number) => Math.abs(a - b) < 0.02;
const PARTS = ["ticket", "convenience", "wallet", "insurance"] as const;

/** Parses an amount; a scanned "2045" (dot lost) is 20.45. */
function money(raw: string) { const s = raw.replace(/,/g, ""); return Number(s.includes(".") ? s : `${s.slice(0, -2)}.${s.slice(-2)}`); }

/**
 * Readings of one amount: as read, and with its first digit dropped. OCR often reads the ₹ sign as a leading
 * digit ("₹352.25" → "3352.25", "₹0.45" → "20.45", "₹1,214.05" → "21,214.05").
 */
function readings(raw: string): number[] {
  const out = [money(raw)], rest = raw.replace(/^\d,?/, "");
  if (rest === raw || !/^\d/.test(rest)) return out;
  // IRCTC writes ₹1,000 and up with a comma, so four or more digits with no comma start with the misread ₹.
  if (!raw.includes(",") && /^\d{4,}\./.test(raw)) return [money(rest)];
  return [...out, money(rest)];
}

/** True when the parts add up to the total (a fare with no parts can't be checked). */
export function fareAddsUp(fare: Fare | undefined): boolean {
  if (!fare?.total || fare.ticket === undefined) return false;
  return near(PARTS.reduce((a, k) => a + (fare[k] ?? 0), 0), fare.total);
}

/**
 * Reads the fare. Handles "Label 340.00" lines (PDF/OCR) and the email's label row followed by a value row
 * ("Rs. 340.00 Rs. 17.70 …"). Scanned amounts are reconciled: of every combination of readings (see `readings`),
 * the one where the parts add up to the total, with the fewest corrections, wins.
 */
export function parseFare(raw: string): Fare | undefined {
  const text = raw.replace(/\r/g, "");
  const amount = String.raw`(?:Rs\.?|INR|₹)?\s*[X$%]?\s*(\d[\d,]*\.?\d{2})(?![\d])`;
  const pick = (label: string) => text.match(new RegExp(label + String.raw`[^\n\d]*?` + amount, "i"))?.[1];
  let found: Partial<Record<keyof Fare, string>> = {
    ticket: pick(String.raw`Ticket\W{1,4}Fare`), convenience: pick(String.raw`Convenience\s+Fee(?:\s*\(Incl\.?\s*of\s*GST\))?`),
    wallet: pick(String.raw`(?:e-?Wallet|Payment\s+Gateway)\s+(?:Transaction\s+)?Charges?`), insurance: pick(String.raw`Travel\s+Insurance\s+Premium(?:\s*\(Incl\.?\s*of\s*GST\))?`),
    total: pick(String.raw`Total\s+Fare(?:\s*\(all\W+inclusive\))?`),
  };
  // Email layout: the labels sit on one row and "Rs. …" values on the next, in the same order.
  if (found.total === undefined) {
    const row = text.match(/Ticket\s+Fare[^\n]*Total\s+Fare[^\n]*\n([^\n]*)/i)?.[1];
    const values = row ? [...row.matchAll(/(?:Rs\.?|₹)\s*([\d,]+\.\d{2})/g)].map(m => m[1]) : [];
    if (values.length >= 2) found = { ticket: values[0], convenience: values.length > 2 ? values[1] : undefined, wallet: values.length > 3 ? values[2] : undefined, insurance: values.length > 4 ? values[3] : undefined, total: values[values.length - 1] };
  }
  if (found.total === undefined) return undefined;
  const keys = (["total", ...PARTS] as const).filter(k => found[k] !== undefined);
  const options = keys.map(k => readings(found[k]!));
  let best: { fare: Fare; fixes: number } | undefined;
  const walk = (i: number, fare: Partial<Fare>, fixes: number) => {
    if (i === keys.length) { if (fare.total! > 0 && fareAddsUp(fare as Fare) && (!best || fixes < best.fixes)) best = { fare: { ...fare } as Fare, fixes }; return; }
    options[i].forEach((v, n) => walk(i + 1, { ...fare, [keys[i]]: v }, fixes + n));
  };
  walk(0, {}, 0);
  if (best) return best.fare;
  // Nothing adds up: keep the total (and the ticket fare if it is plausible), as read.
  const total = money(found.total);
  if (!(total > 0)) return undefined;
  const ticket = found.ticket !== undefined ? readings(found.ticket).find(v => v <= total) : undefined;
  return ticket !== undefined ? { total, ticket } : { total };
}
