import { describe, expect, it } from "vitest";

import { deriveFamilyStage, shouldShowBirthPrompt } from "../src/lib/family-lifecycle";

describe("family lifecycle stage", () => {
  const now = new Date("2026-09-01T00:00:00Z");

  it("derives pregnancy stages from the clinician-confirmed due date", () => {
    expect(deriveFamilyStage({ dueDate: "2027-04-01", birthOccurredAt: null }, now)).toBe("pregnancy-early");
    expect(deriveFamilyStage({ dueDate: "2026-12-01", birthOccurredAt: null }, now)).toBe("pregnancy-mid");
    expect(deriveFamilyStage({ dueDate: "2026-10-20", birthOccurredAt: null }, now)).toBe("pregnancy-late");
    expect(deriveFamilyStage({ dueDate: "2026-09-15", birthOccurredAt: null }, now)).toBe("pregnancy-term");
  });

  it("switches to postpartum stages from the recorded birth time", () => {
    expect(deriveFamilyStage({ dueDate: null, birthOccurredAt: "2026-08-20T08:00:00Z" }, now)).toBe("postpartum-0-6w");
    expect(deriveFamilyStage({ dueDate: null, birthOccurredAt: "2026-05-01T08:00:00Z" }, now)).toBe("postpartum-6w-6m");
    expect(deriveFamilyStage({ dueDate: null, birthOccurredAt: "2025-09-01T00:00:00Z" }, now)).toBe("baby-6-24m");
  });

  it("does not invent a stage without a reliable date", () => {
    expect(deriveFamilyStage({ dueDate: null, birthOccurredAt: null }, now)).toBe("pregnancy-unknown");
    expect(deriveFamilyStage({ dueDate: "invalid", birthOccurredAt: null }, now)).toBe("pregnancy-unknown");
  });

  it.each([
    [null, false], ["invalid", false], ["2026-02-30", false],
    ["2027-04-01", false], ["2026-12-01", false], ["2026-09-23", false],
    ["2026-09-22", true], ["2026-09-01", true], ["2026-08-15", true]
  ])("only prompts near birth, with due date %s", (dueDate, visible) => {
    expect(shouldShowBirthPrompt(dueDate, now)).toBe(visible);
  });

  it("uses the Vietnam calendar day at the 37-week boundary", () => {
    expect(shouldShowBirthPrompt("2026-09-23", new Date("2026-09-01T16:59:59Z"))).toBe(false);
    expect(shouldShowBirthPrompt("2026-09-23", new Date("2026-09-01T17:00:00Z"))).toBe(true);
  });
});
