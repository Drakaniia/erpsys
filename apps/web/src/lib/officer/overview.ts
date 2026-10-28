import { PRE_ENROLLMENT_STEP_CODES, stepLabel } from "$lib/domain/constants";
import { TAB_BY_STEP, type OfficerTab } from "./tabs";
import type { StepCode } from "./types";

export type ReviewDay = {
  day: string;
  submitted: number;
  verified: number;
  returned: number;
};

export type DeskStep = {
  code: string;
  name: string;
  order: number;
  verified: number;
  unverified: number;
  awaitingReview: number;
  returned: number;
  oldestAwaitingAt: string | null;
  hint: string;
  tab: OfficerTab;
};

export type Decision = {
  id: string;
  studentName: string;
  stepName: string;
  action: string;
  at: string;
};

export type OfficerOverview = {
  hasActiveYear: boolean;
  steps: DeskStep[];
  trend: ReviewDay[];
  /** `null` when the payload predates the student tally (or is the admin shape). */
  students: { started: number; cleared: number } | null;
  decisions: Decision[];
  totals: {
    awaitingReview: number;
    returned: number;
    verified: number;
    unverified: number;
  };
  /** The step whose oldest waiting submission has waited longest. */
  longestWait: DeskStep | null;
};

type Loose = Record<string, unknown>;

const num = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) ? value : 0;
const str = (value: unknown) => (typeof value === "string" ? value : "");
const sum = (values: number[]) => values.reduce((n, v) => n + v, 0);

const OFFICER_STEPS = new Set<string>(PRE_ENROLLMENT_STEP_CODES);

/**
 * `GET /api/v1/me/overview` answers an officer with `{ steps, reviewTrend,
 * students, recentActivity, hasActiveYear }` and an admin (who may also open
 * /officer) with `{ stepTotals, activeYear, recentActivity }`. Both fold into
 * one model; fields the admin shape lacks degrade to honest zeros/nulls.
 */
export function normalizeOverview(raw: unknown): OfficerOverview | null {
  if (!raw || typeof raw !== "object") return null;
  const data = raw as Loose;
  const isAdminShape = !Array.isArray(data.steps) && Array.isArray(data.stepTotals);
  const hasActiveYear =
    typeof data.hasActiveYear === "boolean"
      ? data.hasActiveYear
      : data.activeYear != null;

  const rawSteps = (
    (isAdminShape ? data.stepTotals : data.steps) as Loose[] | undefined
  ) ?? [];

  const steps: DeskStep[] = rawSteps
    .filter((s) => OFFICER_STEPS.has(str(s.code)))
    .map((s) => {
      const code = str(s.code);
      const meta = TAB_BY_STEP.get(code as StepCode);
      const unverified = num(s.unverified);
      return {
        code,
        name: stepLabel(code) || str(s.name),
        order: num(s.order),
        verified: num(s.verified),
        unverified,
        awaitingReview:
          s.awaitingReview === undefined ? unverified : num(s.awaitingReview),
        returned: num(s.returned),
        oldestAwaitingAt: str(s.oldestAwaitingAt) || null,
        hint: meta?.hint ?? "",
        tab: meta?.id ?? "overview",
      };
    })
    .sort((a, b) => a.order - b.order);

  const trend = ((data.reviewTrend as Loose[] | undefined) ?? []).map((d) => ({
    day: str(d.day),
    submitted: num(d.submitted),
    verified: num(d.verified),
    returned: num(d.returned),
  }));

  const studentsRaw = data.students as Loose | undefined;
  const students =
    studentsRaw && typeof studentsRaw === "object"
      ? { started: num(studentsRaw.started), cleared: num(studentsRaw.cleared) }
      : null;

  const decisions = ((data.recentActivity as Loose[] | undefined) ?? []).map(
    (a) => ({
      id: String(a.id ?? ""),
      studentName: str(a.studentName) || str(a.actorName) || "Unknown",
      stepName:
        stepLabel(str(a.stepCode)) || str(a.stepName) || str(a.targetRef),
      action: str(a.action),
      at: str(a.at),
    }),
  );

  const longestWait = steps.reduce<DeskStep | null>((oldest, step) => {
    if (!step.oldestAwaitingAt) return oldest;
    if (!oldest?.oldestAwaitingAt) return step;
    return Date.parse(step.oldestAwaitingAt) < Date.parse(oldest.oldestAwaitingAt)
      ? step
      : oldest;
  }, null);

  return {
    hasActiveYear,
    steps,
    trend,
    students,
    decisions,
    totals: {
      awaitingReview: sum(steps.map((s) => s.awaitingReview)),
      returned: sum(steps.map((s) => s.returned)),
      verified: sum(steps.map((s) => s.verified)),
      unverified: sum(steps.map((s) => s.unverified)),
    },
    longestWait,
  };
}

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

/** How long something has waited, in words: "under an hour", "5 hours", "3 days". */
export function waitedFor(iso: string, now = Date.now()): string {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return "";
  const diff = Math.max(0, now - then);
  if (diff < HOUR_MS) return "under an hour";
  if (diff < DAY_MS) {
    const h = Math.floor(diff / HOUR_MS);
    return `${h} ${h === 1 ? "hour" : "hours"}`;
  }
  const d = Math.floor(diff / DAY_MS);
  return `${d} ${d === 1 ? "day" : "days"}`;
}

const plural = (n: number, one: string, many: string) =>
  `${n.toLocaleString()} ${n === 1 ? one : many}`;

/**
 * The page opens on one sentence: how much is waiting on the officer, then
 * where to start. Everything else on the page supports that decision.
 */
export function headline(
  model: OfficerOverview,
  now = Date.now(),
): { lead: string; follow: string } {
  const { awaitingReview, verified, returned } = model.totals;
  if (awaitingReview === 0) {
    return {
      lead: "Your desk is clear.",
      follow:
        verified + returned === 0
          ? "New submissions land here as students finish a step."
          : "Every submission so far has a decision. New ones land here as they arrive.",
    };
  }
  const lead = `${plural(awaitingReview, "submission is", "submissions are")} waiting for your review.`;
  const wait = model.longestWait;
  if (wait?.oldestAwaitingAt) {
    return {
      lead,
      follow: `Start with ${wait.name} — its oldest has waited ${waitedFor(wait.oldestAwaitingAt, now)}.`,
    };
  }
  const busiest = [...model.steps].sort(
    (a, b) => b.awaitingReview - a.awaitingReview,
  )[0];
  return {
    lead,
    follow: busiest ? `${busiest.name} has the most (${busiest.awaitingReview.toLocaleString()}).` : "",
  };
}

/** `"2025-07-10"` → local midnight of that campus day, for the time axis. */
export function parseDay(day: string): Date {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y!, (m ?? 1) - 1, d ?? 1);
}

export function trendPoints(
  model: OfficerOverview,
): Array<{ date: Date; submitted: number; verified: number; returned: number }> {
  return model.trend.map((d) => ({
    date: parseDay(d.day),
    submitted: d.submitted,
    verified: d.verified,
    returned: d.returned,
  }));
}

/** Share of `part` in `whole` as a whole-number percent; 0 when `whole` is 0. */
export function percent(part: number, whole: number): number {
  return whole > 0 ? Math.round((part / whole) * 100) : 0;
}
