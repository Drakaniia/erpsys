import { roleLabel } from "$lib/auth/role-label";
import { stepLabel } from "$lib/domain/constants";

export type AccountRole =
  | "STUDENT"
  | "SBO_OFFICER"
  | "ENROLLMENT_ADVISER"
  | "ADMIN";

export const ACCOUNT_ROLES: readonly AccountRole[] = [
  "STUDENT",
  "SBO_OFFICER",
  "ENROLLMENT_ADVISER",
  "ADMIN",
];

export type StepTotal = {
  code: string;
  name: string;
  order: number;
  verified: number;
  unverified: number;
};

export type DepartmentTally = {
  departmentId: string;
  name: string;
  code: string;
  waiting: number;
  serving?: number;
  enrolled: number;
};

export type QueueDay = { day: string; joined: number; completed: number };

export type AdminActivity = {
  id: string;
  actorName: string;
  action: string;
  targetRef?: string | null;
  at: string;
};

/** Shape of `GET /api/v1/me/overview` for an admin session. */
export type AdminOverview = {
  roleCounts: Record<AccountRole, number>;
  activeYear: { id: string; label: string; semesterLabel: string } | null;
  stepTotals: StepTotal[];
  recentActivity: AdminActivity[];
  departmentTallies: DepartmentTally[];
  /** Absent in payloads cached before the trend shipped. */
  queueTrend?: QueueDay[];
};

export type OverviewSummary = {
  enrolled: number;
  waiting: number;
  serving: number;
  notVerified: number;
  accounts: number;
  busiestStep: { name: string; notVerified: number } | null;
};

const sum = (values: number[]) => values.reduce((n, v) => n + v, 0);

export function summarize(data: AdminOverview): OverviewSummary {
  const steps = [...data.stepTotals].sort((a, b) => a.order - b.order);
  const busiest = steps.reduce<StepTotal | null>(
    (best, step) =>
      step.unverified > 0 && (!best || step.unverified > best.unverified)
        ? step
        : best,
    null,
  );
  return {
    enrolled: sum(data.departmentTallies.map((d) => d.enrolled)),
    waiting: sum(data.departmentTallies.map((d) => d.waiting)),
    serving: sum(data.departmentTallies.map((d) => d.serving ?? 0)),
    notVerified: sum(steps.map((s) => s.unverified)),
    accounts: sum(ACCOUNT_ROLES.map((r) => data.roleCounts[r] ?? 0)),
    busiestStep: busiest
      ? {
          name: stepLabel(busiest.code) || busiest.name,
          notVerified: busiest.unverified,
        }
      : null,
  };
}

const plural = (n: number, one: string, many: string) =>
  `${n.toLocaleString()} ${n === 1 ? one : many}`;

/**
 * The overview opens on one sentence that states where the term stands.
 * `lead` carries the outcome; `follow` points at where to look next.
 */
export function headline(
  data: AdminOverview,
  summary: OverviewSummary,
): { lead: string; follow: string } {
  if (!data.activeYear) {
    return {
      lead: "No academic year is active.",
      follow: "Clearance tracking starts once you activate one.",
    };
  }
  const lead =
    summary.enrolled === 0
      ? "No student has finished enrollment yet this term."
      : `${plural(summary.enrolled, "student has", "students have")} finished enrollment this term.`;
  const follow = summary.busiestStep
    ? `${summary.busiestStep.name} has the most submissions still unverified (${summary.busiestStep.notVerified.toLocaleString()}).`
    : "Every submitted step has been verified.";
  return { lead, follow };
}

export function orderedSteps(data: AdminOverview): StepTotal[] {
  return [...data.stepTotals]
    .sort((a, b) => a.order - b.order)
    .map((s) => ({ ...s, name: stepLabel(s.code) || s.name }));
}

/** `"2025-07-10"` → local midnight of that campus day, for the time axis. */
export function parseDay(day: string): Date {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y!, (m ?? 1) - 1, d ?? 1);
}

export function trendPoints(
  data: AdminOverview,
): Array<{ date: Date; joined: number; completed: number }> {
  return (data.queueTrend ?? []).map((d) => ({
    date: parseDay(d.day),
    joined: d.joined,
    completed: d.completed,
  }));
}

export function accountSlices(
  data: AdminOverview,
): Array<{ role: AccountRole; label: string; value: number }> {
  return ACCOUNT_ROLES.map((role) => ({
    role,
    label: roleLabel(role),
    value: data.roleCounts[role] ?? 0,
  }));
}
