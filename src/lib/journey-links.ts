/** Builds a same-origin, account-authorized journey destination without route text or ticket data. */
export function journeyLink(id: string) { return `/journeys?journey=${encodeURIComponent(id)}`; }

/** Accepts only the journey route for notification navigation, preventing external redirects. */
export function safeJourneyDestination(value: unknown) {
  if (typeof value !== "string") return "/journeys";
  try {
    const url = new URL(value, "https://railwatch.invalid");
    if (url.origin !== "https://railwatch.invalid" || url.pathname !== "/journeys") return "/journeys";
    const id = url.searchParams.get("journey");
    return id && id.length <= 128 ? journeyLink(id) : "/journeys";
  } catch { return "/journeys"; }
}
