import { ApiError } from "./errors.js";
import { AVAILABILITY_IDLE_MS } from "./availability.js";
import {
  YEAR_LEVEL_LABELS,
  normalizeYearLevels,
  type YearLevel,
} from "./constants.js";

export const LINE_STATUSES = ["WAITING", "IN_PROGRESS"];

export type AvailabilityRow = {
  adviserId: string;
  departmentId: string;
  isOpen: boolean;
  lastActiveAt?: Date | string | null;
};

export type ServingRow = {
  departmentId: string;
  servedById?: string | null;
};

export type AdviserLevelRow = {
  adviserId: string;
  departmentId: string;
  yearLevels?: readonly YearLevel[];
};

export function availabilityKey(
  adviserId: string,
  departmentId: string,
): string {
  return `${adviserId}:${departmentId}`;
}

export function liveAvailabilityPairs(args: {
  availabilities: AvailabilityRow[];
  serving: ServingRow[];
  now?: number;
}): Set<string> {
  const now = args.now ?? Date.now();
  const servingKeys = new Set(
    args.serving
      .filter((s) => s.servedById)
      .map((s) => availabilityKey(String(s.servedById), s.departmentId)),
  );

  const live = new Set<string>();
  for (const a of args.availabilities) {
    const key = availabilityKey(a.adviserId, a.departmentId);
    if (servingKeys.has(key)) {
      live.add(key);
      continue;
    }
    if (!a.isOpen) continue;
    if (!a.lastActiveAt) continue;
    if (new Date(a.lastActiveAt).getTime() > now - AVAILABILITY_IDLE_MS) {
      live.add(key);
    }
  }
  return live;
}

export function openByDepartment(args: {
  availabilities: AvailabilityRow[];
  serving: ServingRow[];
  now?: number;
}): Map<string, string> {
  const live = liveAvailabilityPairs(args);
  const open = new Map<string, string>();
  for (const a of args.availabilities) {
    if (!live.has(availabilityKey(a.adviserId, a.departmentId))) continue;
    if (!open.has(a.departmentId)) open.set(a.departmentId, a.adviserId);
  }
  return open;
}

export function levelsCoveredByDepartment(args: {
  availabilities: AvailabilityRow[];
  serving: ServingRow[];
  assignments: readonly AdviserLevelRow[];
  now?: number;
}): Map<string, YearLevel[]> {
  const live = liveAvailabilityPairs(args);
  const levelsBy = new Map<string, readonly YearLevel[]>();
  for (const link of args.assignments) {
    levelsBy.set(
      availabilityKey(link.adviserId, link.departmentId),
      link.yearLevels ?? [],
    );
  }

  const covered = new Map<string, YearLevel[]>();
  for (const a of args.availabilities) {
    const key = availabilityKey(a.adviserId, a.departmentId);
    if (!live.has(key)) continue;
    const levels = levelsBy.get(key);
    if (!levels || levels.length === 0) continue;
    const held = covered.get(a.departmentId);
    covered.set(
      a.departmentId,
      held
        ? normalizeYearLevels([...held, ...levels])
        : normalizeYearLevels([...levels]),
    );
  }
  return covered;
}

export function aheadInLine(args: {
  departmentId: string;
  academicYearId: string;
  entryId: string;
  joinedAt: Date;
}): Record<string, unknown> {
  return {
    departmentId: args.departmentId,
    academicYearId: args.academicYearId,
    status: { $in: LINE_STATUSES },
    $or: [
      { joinedAt: { $lt: args.joinedAt } },
      { joinedAt: args.joinedAt, _id: { $lt: args.entryId } },
    ],
  };
}

const DUPLICATE_KEY_CODE = 11000;

export function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === DUPLICATE_KEY_CODE
  );
}

export function assertLeavable(status: string): void {
  if (status === "COMPLETED") {
    throw new ApiError("CONFLICT", {
      message: "You are already enrolled — your queue entry cannot be removed.",
    });
  }
  if (status === "IN_PROGRESS") {
    throw new ApiError("CONFLICT", {
      message: "An adviser is serving you right now — wait for them to finish.",
    });
  }
}

export function assertLevelServed(args: {
  departmentName: string;
  yearLevel: YearLevel | null;
  coveredLevels: readonly YearLevel[];
}): void {
  if (args.yearLevel === null) {
    throw new ApiError("PRECONDITION_FAILED", {
      message: "Choose your year level before joining a queue.",
    });
  }
  if (args.coveredLevels.includes(args.yearLevel)) return;
  const label = YEAR_LEVEL_LABELS[args.yearLevel];
  const covers = args.coveredLevels.length
    ? `${args.coveredLevels.map((l) => YEAR_LEVEL_LABELS[l]).join(", ")}`
    : "no year levels";
  throw new ApiError("CONFLICT", {
    message: `No adviser is currently serving ${label} students in ${args.departmentName} — the open advisers cover ${covers}.`,
  });
}

export function escapeQueryRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function missingPreEnrollmentCodes(
  verifications: { status?: string | null; stepId: string }[],
  codeByStepId: ReadonlyMap<string, string>,
  requiredCodes: readonly string[],
): string[] {
  const verified = new Set(
    verifications
      .filter((v) => v.status === "VERIFIED")
      .map((v) => codeByStepId.get(String(v.stepId))),
  );
  return requiredCodes.filter((code) => !verified.has(code));
}
