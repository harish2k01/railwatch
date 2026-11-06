/** Fare breakdown read from an IRCTC ticket (ERS PDF, its OCR text, or the booking-confirmation email). */
export type Fare = { total: number; ticket?: number; convenience?: number; wallet?: number; insurance?: number };

const money = (s: string) => Number(s.replace(/,/g, ""));
const near = (a: number, b: number) => Math.abs(a - b) < 0.02;

/**
 * Reads the fare. Handles "Label 340.00" lines (PDF/OCR) and the email's label row followed by a value row
 * ("Rs. 340.00 Rs. 17.70 …"). OCR often reads the ₹ sign as a leading "2" or "X" (₹17.70 → "217.70"); the parts
 * are reconciled against the total to undo that.
 */
export function parseFare(raw: string): Fare | undefined {
  const text = raw.replace(/\r/g, "");
  const amount = String.raw`(?:Rs\.?|INR|₹)?\s*[X]?([\d,]+\.\d{2})`;
  const pick = (label: string) => { const m = text.match(new RegExp(label + String.raw`[^\n\d]*?` + amount, "i")); return m ? money(m[1]) : undefined; };
  let fare: Partial<Fare> = {
    ticket: pick(String.raw`Ticket\s+Fare`), convenience: pick(String.raw`Convenience\s+Fee(?:\s*\(Incl\.?\s*of\s*GST\))?`),
    wallet: pick(String.raw`(?:e-?Wallet|Payment\s+Gateway)\s+(?:Transaction\s+)?Charges?`), insurance: pick(String.raw`Travel\s+Insurance\s+Premium(?:\s*\(Incl\.?\s*of\s*GST\))?`),
    total: pick(String.raw`Total\s+Fare(?:\s*\(all\s+inclusive\))?`),
  };
  // Email layout: the labels sit on one row and "Rs. …" values on the next, in the same order.
  if (fare.total === undefined) {
    const row = text.match(/Ticket\s+Fare[^\n]*Total\s+Fare[^\n]*\n([^\n]*)/i)?.[1];
    const values = row ? [...row.matchAll(/(?:Rs\.?|₹)\s*([\d,]+\.\d{2})/g)].map(m => money(m[1])) : [];
    if (values.length >= 2) fare = { ticket: values[0], convenience: values.length > 2 ? values[1] : undefined, wallet: values.length > 3 ? values[2] : undefined, insurance: values.length > 4 ? values[3] : undefined, total: values[values.length - 1] };
  }
  if (fare.total === undefined || !(fare.total > 0)) return undefined;
  // Undo an OCR'd ₹ read as a leading 2 when that makes the parts add up to the total.
  const keys = ["convenience", "wallet", "insurance"] as const;
  const sum = () => (fare.ticket ?? 0) + keys.reduce((a, k) => a + (fare[k] ?? 0), 0);
  if (fare.ticket !== undefined && !near(sum(), fare.total)) {
    for (const k of keys) {
      const v = fare[k]; if (v === undefined) continue;
      const fixed = Number(String(v.toFixed(2)).replace(/^2(?=\d)/, ""));
      if (fixed !== v) { const before = fare[k]; fare[k] = fixed; if (near(sum(), fare.total)) break; if (Math.abs(sum() - fare.total) > Math.abs(sum() - fixed + (before ?? 0) - fare.total)) fare[k] = before; }
    }
    if (!near(sum(), fare.total)) return { total: fare.total, ticket: fare.ticket };
  }
  return Object.fromEntries(Object.entries(fare).filter(([, v]) => v !== undefined)) as Fare;
}
