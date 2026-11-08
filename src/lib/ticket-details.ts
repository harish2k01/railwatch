import { parseFare } from "./ticket-fare";
import { isDay, type Journey } from "./travel-planner";

export type TicketDetails = Partial<Pick<Journey, "from" | "to" | "date" | "trainNumber" | "trainName" | "travelClass" | "pnr" | "coach" | "seat" | "berth" | "departure" | "ticketStatus" | "bookingType" | "fare">>;
/** Extracts validated ticket-field suggestions from QR JSON, printed text, or OCR. */
export function parseTicketDetails(raw: string): TicketDetails {
  const text = raw.replace(/\r/g, "").replace(/[,;]\s*(?=(?:PNR|Train\s*(?:No|Number|Name)|From|To|Class|Journey\s*Date|Departure|Coach|Seat|Berth)\s*[:=])/gi,"\n").replace(/\b(TrainNo|TrainName|JourneyDate|DepartureTime|CoachNo|SeatNo|BerthType)\b/g, label=>label.replace(/([a-z])([A-Z])/g,"$1 $2")).replace(/\b(From|To|Class|Coach|Seat No|Berth Type|Train No|Train Name|Journey Date|Departure Time)\s*=/gi,"$1:"); const details: TicketDetails = {};
  let json: Record<string, unknown> | undefined;
  try { const value = JSON.parse(raw); if (value && typeof value === "object" && !Array.isArray(value)) json = value; } catch { /* A QR may contain plain ticket text. */ }
  if (json) {
    const normalized: Record<string, unknown> = {};
    const /** Normalizes ticket field labels for matching across ticket formats. */ normalizeKey=(key:string)=>key.toLowerCase().replace(/[^a-z0-9]/g,"");
        /** Collects supported ticket fields from nested QR objects and the first passenger record. */
    function flatten(value:Record<string,unknown>,depth=0){if(depth>8)return;for(const [key,item] of Object.entries(value)){if(typeof item === "string"||typeof item === "number")normalized[normalizeKey(key)]=item;else if(item&&typeof item==="object"&&!Array.isArray(item))flatten(item as Record<string,unknown>,depth+1);else if(Array.isArray(item)&&item[0]&&typeof item[0]==="object")flatten(item[0] as Record<string,unknown>,depth+1);}}
    flatten(json);
    const aliases: Record<Exclude<keyof TicketDetails, "ticketStatus" | "bookingType" | "fare">, string[]> = { from: ["from", "source", "boardingStation"], to: ["to", "destination"], date: ["date", "journeyDate", "travelDate"], trainNumber: ["trainNumber", "trainNo", "train_no"], trainName: ["trainName", "train_name"], travelClass: ["travelClass", "class"], pnr: ["pnr", "PNR", "pnrNumber", "pnrNo"], coach: ["coach", "coachNumber", "coachNo"], seat: ["seat", "seatNumber", "seatNo", "berthNumber", "berthNo"], berth: ["berth", "berthType"], departure: ["departure", "departureTime", "scheduledDeparture", "boardingTime"] };
    for (const [key, keys] of Object.entries(aliases)) { const value = keys.map(k => normalized[normalizeKey(k)]).find(v => typeof v === "string" || typeof v === "number"); if (value !== undefined) (details as Record<string, string>)[key] = String(value).trim(); }
  } else {
    const /** Returns the first matching ticket field from the parsed text. */ match = (pattern: RegExp) => text.match(pattern)?.[1]?.trim();
    details.pnr = match(/\bPNR(?:\s*(?:No\.?|Number))?\s*[:#\-]?\s*(\d{10})\b/i);
    details.trainNumber = match(/\bTrain\s*(?:No\.?|Number)(?:\s*\/\s*Name)?\s*[:#\-]?\s*(\d{5})\b/i);
    details.trainName = match(/\bTrain\s*Name\s*[:\-]\s*([^\n]+)/i) ?? match(/\bTrain\s*(?:No\.?|Number)\s*\/\s*Name\s*[:\-]?\s*\d{5}\s*\/\s*([^\n]+)/i);
    details.travelClass = match(/\bClass\s*[:\-]?\s*(1A|2A|3A|3E|SL|CC|EC|2S)\b/i)?.toUpperCase() ?? match(/\bClass\s*[:\-]?[^\n]*\n?[^\n]*?\((1A|2A|3A|3E|SL|CC|EC|2S)\)/i)?.toUpperCase();
    details.date = match(/\b(?:Date of Journey|Journey Date|Travel Date|Boarding Date)\s*\*?\s*[:\-]?\s*(\d{4}-\d{2}-\d{2}|\d{2}[-\/]\d{2}[-\/]\d{4})/i);
    details.from = match(/(?:^|\n)\s*(?:Boarding At|Boarding Station)\s*[:\-]?\s*\n?\s*([^\n]+)/i) ?? match(/(?:^|\n)\s*(?:Booked From|From)\s*[:\-]?\s*\n?\s*([^\n]+)/i);
    details.to = match(/(?:^|\n)\s*(?:To|Destination|Reservation Upto)\s*[:\-]?\s*\n?\s*([^\n]+)/i);
    details.coach = match(/\bCoach(?:\s*(?:No\.?|Number))?\s*[:\-]\s*([A-Z0-9-]{1,10})\b/i);
    details.seat = match(/\b(?:Seat|Berth)(?:\s*(?:No\.?|Number))\s*[:\-]\s*(\d{1,3}(?:\s*[,/]\s*\d{1,3})*)/i);
    details.berth = match(/\bBerth(?:\s*Type)?\s*[:\-]\s*(Lower|Middle|Upper|Side Lower|Side Upper|LB|MB|UB|SL|SU|Chair)\b/i);
    details.departure = match(/\b(?:Departure(?: Time)?|Boarding Time)\s*[:\-]\s*((?:[01]\d|2[0-3]):[0-5]\d)/i);
    // IRCTC ERS prints a row of labels, then a row of values in the same columns.
    const valuesUnder = (label: RegExp) => { const m = text.match(new RegExp(label.source + String.raw`[^\n]*\n([^\n]+)`, "i")); return m?.[1]; };
    const stationRow = valuesUnder(/Booked\s+From/)?.match(/\(([A-Z]{2,5})\)/g)?.map(code => code.slice(1, -1));
    if (stationRow && stationRow.length >= 2) { details.from = stationRow.length >= 3 ? stationRow[1] : stationRow[0]; details.to = stationRow[stationRow.length - 1]; }
    const idRow = valuesUnder(/\bPNR\b/);
    if (idRow) {
      details.pnr ??= idRow.match(/\b(\d{10})\b/)?.[1];
      const train = idRow.match(/\b(\d{5})\s*\/\s*(.+?)(?=\s+(?:SLEEPER|AC\b|FIRST|SECOND|THIRD|EXECUTIVE|CHAIR|GENERAL)\b|\s*\(|$)/i);
      if (train) { details.trainNumber ??= train[1]; details.trainName ??= train[2].trim(); }
    }
    // OCR can misread a PNR digit. Every place the PNR is printed votes: the label, the table row under "PNR",
    // and the GST invoice number (two letters, two digits, the PNR, then a serial).
    const votes = [...text.matchAll(/\bPNR(?:\s*(?:No\.?|Number))?\s*[:#\-]?\s*(\d{10})\b/gi)].map(m => m[1])
      .concat([...text.matchAll(/\bPNR\b[^\n]*\n[^\n]*?\b(\d{10})\b/gi)].map(m => m[1]))
      .concat([...text.matchAll(/\bInvoice\s*(?:Number|No\.?)\s*[:\-]?\s*[A-Z]{2}\d{2}(\d{10})\d{1,4}\b/gi)].map(m => m[1]));
    if (votes.length) { const tally = new Map<string, number>(); for (const v of votes) tally.set(v, (tally.get(v) ?? 0) + 1); details.pnr = [...tally].sort((a, b) => b[1] - a[1])[0][0]; }
    // OCR can garble the "Train No./Name" label; the value itself ("12637 / PANDIAN SF EXP") is distinctive enough.
    if (!details.trainNumber || !details.trainName) {
      const loose = text.match(/(?:^|[\s:])(\d{5})\s*\/\s*([A-Z][A-Z0-9 .()'-]{2,60}?)(?=\s{2,}|\s+(?:SLEEPER|AC\b|FIRST|SECOND|THIRD|EXECUTIVE|CHAIR|GENERAL)\b|\s*\n|\s*$)/m);
      if (loose) { details.trainNumber ??= loose[1]; details.trainName ??= loose[2].trim(); }
    }
    // Many tickets print passenger rows rather than labelled coach/seat fields.
    const allocation = text.match(/\b(?:CNF|CONFIRMED)\s*[,/ ]+\s*([A-Z]{1,2}\d{1,2})\s*[,/ ]+\s*(\d{1,3})\s*[,/ ]+\s*(SIDE\s+LOWER|SIDE\s+UPPER|LOWER|MIDDLE|UPPER|WINDOW\s+SIDE|AISLE|LB|MB|UB|SL|SU|WS|CHAIR)\b/i);
    if (allocation) { details.coach ??= allocation[1]; details.seat ??= allocation[2]; details.berth ??= allocation[3]; }
  }
  // QR allocation strings and tabular passenger rows often use the same status format.
  const allocationSource=json?JSON.stringify(json):text;
  const allocation=allocationSource.match(/\b(?:CNF|CONFIRMED)\s*[,/ ]+\s*([A-Z]{1,2}\d{1,2})\s*[,/ ]+\s*(\d{1,3})\s*[,/ ]+\s*(SIDE\s+LOWER|SIDE\s+UPPER|LOWER|MIDDLE|UPPER|WINDOW\s+SIDE|AISLE|LB|MB|UB|SL|SU|WS|CHAIR)\b/i);
  if(allocation){details.coach??=allocation[1];details.seat??=allocation[2];details.berth??=allocation[3];}
  const currentStatus=allocationSource.match(/current[ _]*status["\s]*[:=]["\s]*((?:CNF|CONFIRMED)[^"\n]+)/i)?.[1];
  const current=currentStatus?.match(/(?:CNF|CONFIRMED)\s*[,/ ]+\s*([A-Z]{1,2}\d{1,2})\s*[,/ ]+\s*(\d{1,3})\s*[,/ ]+\s*(SIDE\s+LOWER|SIDE\s+UPPER|LOWER|MIDDLE|UPPER|WINDOW\s+SIDE|AISLE|LB|MB|UB|SL|SU|WS|CHAIR)\b/i);
  if(current){details.coach=current[1];details.seat=current[2];details.berth=current[3];}
  const passengerRow=text.match(/(?:Booking Status|Current Status)[^\n]*\n[^\n]*?\b([A-Z]{1,2}\d{1,2})\s+(\d{1,3})\s+(SIDE\s+LOWER|SIDE\s+UPPER|LOWER|MIDDLE|UPPER|WINDOW\s+SIDE|AISLE|LB|MB|UB|SL|SU|WS)\b/i);
  if(passengerRow){details.coach??=passengerRow[1];details.seat??=passengerRow[2];details.berth??=passengerRow[3];}
  // Every passenger row ("1. NAME 25 M CNF/S7/27/UPPER CNF/S7/27/UPPER"): use each row's current (last) allocation.
  const seatPattern = /(?:CNF|CONFIRMED)\s*[,/ ]+\s*([A-Z]{1,2}\d{1,2})\s*[,/ ]+\s*(\d{1,3})\s*[,/ ]+\s*(SIDE\s+LOWER|SIDE\s+UPPER|LOWER|MIDDLE|UPPER|WINDOW\s+SIDE|AISLE|LB|MB|UB|SL|SU|WS|CHAIR)\b/gi;
  // OCR text can hold the same passenger row twice (layout pass + raw pass): keep one per passenger number.
  const byPassenger = new Map<string, RegExpExecArray>();
  for (const row of text.matchAll(/^\s*(\d+)\.\s[^\n]*$/gm)) { const m = [...row[0].matchAll(seatPattern)].pop(); if (m && !byPassenger.has(row[1])) byPassenger.set(row[1], m); }
  const seats = [...byPassenger.values()];
  if (seats.length > 1) {
    const coaches = [...new Set(seats.map(m => m[1].toUpperCase()))];
    details.coach = coaches.join(", ").slice(0, 20);
    details.seat = seats.map(m => m[2]).join(", ").slice(0, 30);
    details.berth = seats.map(m => m[3].toUpperCase().replace(/\s+/g, " ")).join(", ").slice(0, 30);
  }
  details.departure??=text.match(/(?:Scheduled Departure|Departure(?: Time)?|Boarding Time)\s*\*?\s*[:\-]?\s*(?:\d{2}[-/]\w{2,9}[-/]\d{4}\s+)?((?:[01]?\d|2[0-3]):[0-5]\d)(?:\s*(AM|PM))?/i)?.slice(1).filter(Boolean).join(" ");
  if(details.departure){const time=details.departure.match(/^(\d{1,2}):([0-5]\d)(?:\s*(AM|PM))?$/i);if(time){let hour=Number(time[1]);if(time[3]&&hour>=1&&hour<=12)hour=hour%12+(time[3].toUpperCase()==="PM"?12:0);details.departure=String(hour).padStart(2,"0")+":"+time[2];}}
  details.date??=text.match(/\bStart Date\s*\*?\s*[:\-]?\s*(\d{2}-[A-Za-z]{3}-\d{4})/i)?.[1];
  if(details.date&&/^\d{2}-[A-Za-z]{3}-\d{4}$/.test(details.date)){const [day,month,year]=details.date.split("-");const number=["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"].indexOf(month.toLowerCase())+1;details.date=`${year}-${String(number).padStart(2,"0")}-${day}`;}
  if (details.date && /^\d{2}[-\/]\d{2}[-\/]\d{4}$/.test(details.date)) { const [day, month, year] = details.date.split(/[-\/]/); details.date = `${year}-${month}-${day}`; }
  for(const key of ["from","to","trainName"] as const)if(details[key])details[key]=details[key]!.replace(/[,;]\s*$/,"").trim();
  // IRCTC prints stations as "MADURAI JN (MDU)"; journeys use the code.
  for(const key of ["from","to"] as const){const code=details[key]?.match(/\(([A-Z]{2,5})\)/)?.[1];if(code)details[key]=code;}
  if(/\bQuota\s*[:\-]?\s*\n?\s*(?:PREMIUM\s+)?TATKAL\b|\((?:TQ|PT)\)/i.test(json?JSON.stringify(json):text))details.bookingType="tatkal";
  // Plan 3.2: booking status from the current-status column (else booking status); confirmed wins only when no RAC/WL is current.
  const statusText=allocationSource.match(/current[ _]*status["\s]*[:=]["\s]*([A-Z]+)/i)?.[1]??text.match(/(?:Current Status|Booking Status)[^\n]*\n[^\n]*?\b(CNF|CONFIRMED|RAC|RLWL|PQWL|GNWL|TQWL|WL)\b/i)?.[1]??allocationSource.match(/\b(RAC|RLWL|PQWL|GNWL|TQWL|WL|CNF|CONFIRMED)\s*[/ ]*\d*/i)?.[1];
  if(statusText){const v=statusText.toUpperCase();details.ticketStatus=v==="RAC"?"RAC":/WL$/.test(v)?"WL":v==="CNF"||v==="CONFIRMED"?"CNF":undefined;if(!details.ticketStatus)delete details.ticketStatus;}
  if (details.date && !isDay(details.date)) delete details.date;
  if (details.pnr && !/^\d{10}$/.test(details.pnr)) delete details.pnr;
  if (details.trainNumber && !/^\d{5}$/.test(details.trainNumber)) delete details.trainNumber;
  if (details.departure && !/^([01]\d|2[0-3]):[0-5]\d$/.test(details.departure)) delete details.departure;
  const fare = parseFare(text); if (fare) details.fare = fare;
  for (const key of Object.keys(details) as (keyof TicketDetails)[]) if (!details[key]) delete details[key];
  return details;
}
