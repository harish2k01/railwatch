import { expect, it } from "vitest";
import { journeyLink, safeJourneyDestination } from "./journey-links";

it("encodes journey identifiers and rejects external or unrelated destinations", () => {
  expect(journeyLink("trip & return")).toBe("/journeys?journey=trip%20%26%20return");
  expect(safeJourneyDestination("/journeys?journey=trip%26return&next=https://evil.test")).toBe("/journeys?journey=trip%26return");
  for (const value of ["https://evil.test/journeys?journey=1", "//evil.test/journeys", "/admin", "/journeys?journey=" + "x".repeat(129), undefined]) {
    expect(safeJourneyDestination(value)).toBe("/journeys");
  }
});
