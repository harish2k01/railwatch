import { NextResponse, type NextRequest } from "next/server";
import { safeJourneyDestination } from "./lib/journey-links";

/** Passes a validated journey destination to authentication without trusting caller headers. */
export function proxy(request: NextRequest) {
  const headers = new Headers(request.headers);
  headers.set("x-railwatch-journey-path", safeJourneyDestination(request.nextUrl.pathname + request.nextUrl.search));
  return NextResponse.next({ request: { headers } });
}

export const config = { matcher: "/journeys" };
