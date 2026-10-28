import { describe, expect, it } from "vitest";
import { headline, normalizeOverview, percent, waitedFor } from "./overview";

const NOW = Date.parse("2025-07-10T08:00:00Z");

const officerPayload = {
  hasActiveYear: true,
  yearLabel: "2025-2026 · First",
  steps: [
    {
      code: "PROFILING",
      name: "PROFILING",
      order: 3,
      verified: 4,
      unverified: 3,
      awaitingReview: 2,
      returned: 1,
      oldestAwaitingAt: "2025-07-07T08:00:00Z",
    },
    {
      code: "ASSESSMENT",
      name: "ASSESSMENT",
      order: 1,
      verified: 9,
      unverified: 5,
      awaitingReview: 5,
      returned: 0,
      oldestAwaitingAt: "2025-07-09T20:00:00Z",
    },
  ],
  reviewTrend: [{ day: "2025-07-10", submitted: 3, verified: 1, returned: 0 }],
  students: { started: 12, cleared: 2 },
  recentActivity: [
    {
      id: "v-1",
      studentName: "Ana",
      stepCode: "ASSESSMENT",
      stepName: "ASSESSMENT",
      action: "Verified",
      at: "2025-07-09T10:00:00Z",
    },
  ],
};

describe("normalizeOverview", () => {
  it("orders steps, labels them, and totals the desk", () => {
    const model = normalizeOverview(officerPayload)!;
    expect(model.steps.map((s) => s.code)).toEqual(["ASSESSMENT", "PROFILING"]);
    expect(model.steps[0]).toMatchObject({ name: "Assessment", tab: "assessment" });
    expect(model.totals).toEqual({
      awaitingReview: 7,
      returned: 1,
      verified: 13,
      unverified: 8,
    });
    expect(model.students).toEqual({ started: 12, cleared: 2 });
    expect(model.decisions[0]).toMatchObject({ stepName: "Assessment" });
  });

  it("picks the step whose oldest submission has waited longest, not the busiest", () => {
    const model = normalizeOverview(officerPayload)!;
    expect(model.longestWait?.code).toBe("PROFILING");
  });

  // Admins can open /officer and receive the admin payload; the page must
  // still read it instead of rendering an empty desk.
  it("reads the admin shape, dropping the enrollment step", () => {
    const model = normalizeOverview({
      activeYear: { id: "ay", label: "2025", semesterLabel: "First" },
      stepTotals: [
        { code: "ASSESSMENT", name: "A", order: 1, verified: 2, unverified: 3 },
        { code: "ENROLLMENT", name: "E", order: 6, verified: 1, unverified: 0 },
      ],
      recentActivity: [{ id: "l", actorName: "Admin", action: "Did", targetRef: "X", at: "" }],
    })!;
    expect(model.hasActiveYear).toBe(true);
    expect(model.steps.map((s) => s.code)).toEqual(["ASSESSMENT"]);
    expect(model.steps[0]!.awaitingReview).toBe(3);
    expect(model.students).toBeNull();
    expect(model.trend).toEqual([]);
    expect(model.decisions[0]).toMatchObject({ studentName: "Admin", stepName: "X" });
  });

  it("returns null for a missing payload", () => {
    expect(normalizeOverview(undefined)).toBeNull();
  });
});

describe("headline", () => {
  it("names the count and where to start", () => {
    const model = normalizeOverview(officerPayload)!;
    expect(headline(model, NOW)).toEqual({
      lead: "7 submissions are waiting for your review.",
      follow: "Start with Profiling — its oldest has waited 3 days.",
    });
  });

  it("says the desk is clear when nothing waits", () => {
    const model = normalizeOverview({ ...officerPayload, steps: [] })!;
    expect(headline(model, NOW).lead).toBe("Your desk is clear.");
  });
});

describe("waitedFor", () => {
  it("words short and long waits", () => {
    expect(waitedFor("2025-07-10T07:30:00Z", NOW)).toBe("under an hour");
    expect(waitedFor("2025-07-10T03:00:00Z", NOW)).toBe("5 hours");
    expect(waitedFor("2025-07-09T07:00:00Z", NOW)).toBe("1 day");
  });
});

describe("percent", () => {
  it("guards a zero denominator", () => {
    expect(percent(3, 0)).toBe(0);
    expect(percent(1, 3)).toBe(33);
  });
});
