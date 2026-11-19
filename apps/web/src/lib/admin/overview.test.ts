import { describe, expect, it } from "vitest";
import {
  accountSlices,
  headline,
  orderedSteps,
  parseDay,
  summarize,
  trendPoints,
  type AdminOverview,
} from "./overview";

function overview(patch: Partial<AdminOverview> = {}): AdminOverview {
  return {
    roleCounts: { STUDENT: 40, SBO_OFFICER: 3, ENROLLMENT_ADVISER: 5, ADMIN: 2 },
    activeYear: { id: "ay-1", label: "2025-2026", semesterLabel: "First" },
    stepTotals: [
      { code: "PROFILING", name: "PROFILING", order: 3, verified: 10, unverified: 9 },
      { code: "ASSESSMENT", name: "ASSESSMENT", order: 1, verified: 30, unverified: 2 },
      { code: "ENROLLMENT", name: "ENROLLMENT", order: 6, verified: 4, unverified: 0 },
    ],
    recentActivity: [],
    departmentTallies: [
      { departmentId: "d1", name: "College of Technologies", code: "CT", waiting: 5, serving: 1, enrolled: 3 },
      { departmentId: "d2", name: "College of Nursing", code: "CON", waiting: 2, enrolled: 1 },
    ],
    queueTrend: [{ day: "2025-07-10", joined: 2, completed: 1 }],
    ...patch,
  };
}

describe("summarize", () => {
  it("totals the queue and picks the step with the largest unverified pile", () => {
    const s = summarize(overview());
    expect(s).toMatchObject({
      enrolled: 4,
      waiting: 7,
      // A payload cached before `serving` existed counts as zero, not NaN.
      serving: 1,
      notVerified: 11,
      accounts: 50,
      busiestStep: { name: "Profiling", notVerified: 9 },
    });
  });

  it("reports no busiest step when nothing is pending", () => {
    const data = overview({
      stepTotals: [{ code: "ASSESSMENT", name: "A", order: 1, verified: 3, unverified: 0 }],
    });
    expect(summarize(data).busiestStep).toBeNull();
  });
});

describe("headline", () => {
  it("states the outcome and where the pile is", () => {
    const data = overview();
    expect(headline(data, summarize(data))).toEqual({
      lead: "4 students have finished enrollment this term.",
      follow: "Profiling has the most submissions still unverified (9).",
    });
  });

  it("uses the singular for one student", () => {
    const data = overview({
      departmentTallies: [{ departmentId: "d1", name: "X", code: "X", waiting: 0, enrolled: 1 }],
    });
    expect(headline(data, summarize(data)).lead).toBe(
      "1 student has finished enrollment this term.",
    );
  });

  it("points at activation when no year is active", () => {
    const data = overview({ activeYear: null, stepTotals: [], departmentTallies: [] });
    expect(headline(data, summarize(data)).lead).toBe("No academic year is active.");
  });
});

describe("shaping for charts", () => {
  it("orders steps by clearance order with display names", () => {
    expect(orderedSteps(overview()).map((s) => s.name)).toEqual([
      "Assessment",
      "Profiling",
      "Enrollment",
    ]);
  });

  it("reads campus days as local midnight", () => {
    const d = parseDay("2025-07-10");
    expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours()]).toEqual([2025, 6, 10, 0]);
  });

  it("tolerates a payload without a trend", () => {
    expect(trendPoints(overview({ queueTrend: undefined }))).toEqual([]);
  });

  it("labels every role, including empty ones", () => {
    const slices = accountSlices(
      overview({ roleCounts: { STUDENT: 1, SBO_OFFICER: 0, ENROLLMENT_ADVISER: 0, ADMIN: 1 } }),
    );
    expect(slices.map((s) => [s.label, s.value])).toEqual([
      ["Student", 1],
      ["SBO Officer", 0],
      ["Instructor", 0],
      ["Admin", 1],
    ]);
  });
});
