import { isDeepStrictEqual } from "node:util";
import { ObjectId } from "mongodb";
import {
  STEP_CODES,
  STUDENT_NUMBER_PATTERN,
  YEAR_LEVELS,
  yearLevelsOverlap,
  type YearLevel,
} from "../../config/constants.js";
import { validateWindows, type ScheduleWindow } from "../../config/schedule.js";

export const SIMPLIFICATION_COLLECTIONS = [
  "user",
  "department",
  "academic_year",
  "student_profile",
  "adviser_department",
  "requirement_item",
  "social_media_link",
  "adviser_availability",
  "availability_window",
  "content",
  "adviser_schedule",
  "step",
  "step_verification",
  "student_enrollment",
] as const;

export type SimplificationCollection =
  (typeof SIMPLIFICATION_COLLECTIONS)[number];
export type MigrationRow = { _id: string | ObjectId; [key: string]: unknown };
export type SimplificationSnapshot = Record<
  SimplificationCollection,
  MigrationRow[]
>;
export type SimplificationChange = {
  collection:
    | "user"
    | "department"
    | "content"
    | "adviser_schedule"
    | "step_verification";
  before: MigrationRow | null;
  after: MigrationRow;
  set: Record<string, unknown>;
};
export type SimplificationPlan = {
  changes: SimplificationChange[];
  summary: {
    sourceRows: number;
    parentMerges: number;
    destinationInserts: number;
    stepReferencesRemapped: number;
  };
};

export class SimplificationError extends Error {
  constructor(
    readonly code: string,
    readonly collection: SimplificationCollection,
  ) {
    super(`${code} (${collection})`);
    this.name = "SimplificationError";
  }
}

function fail(code: string, collection: SimplificationCollection): never {
  throw new SimplificationError(code, collection);
}

function id(value: unknown, collection: SimplificationCollection): string {
  if (value instanceof ObjectId) return value.toHexString();
  if (typeof value === "string" && value.length > 0) {
    return ObjectId.isValid(value) ? value.toLowerCase() : value;
  }
  return fail("INVALID_ID", collection);
}

function index(rows: MigrationRow[], collection: SimplificationCollection) {
  const result = new Map<string, MigrationRow>();
  for (const row of rows) {
    const key = id(row._id, collection);
    if (result.has(key)) fail("ID_COLLISION", collection);
    result.set(key, row);
  }
  return result;
}

function without(row: MigrationRow, fields: string[]): MigrationRow {
  return Object.fromEntries(
    Object.entries(row).filter(([key]) => !fields.includes(key)),
  ) as MigrationRow;
}

function levels(
  value: unknown,
  collection: SimplificationCollection,
): YearLevel[] {
  if (value === undefined) return [];
  if (
    !Array.isArray(value) ||
    value.some((v) => !(YEAR_LEVELS as readonly unknown[]).includes(v)) ||
    new Set(value).size !== value.length
  )
    fail("INVALID_YEAR_LEVELS", collection);
  return value as YearLevel[];
}

function embedded(
  value: unknown,
  collection: SimplificationCollection,
): MigrationRow {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail("INVALID_EMBEDDED_ROW", collection);
  }
  const row = value as MigrationRow;
  id(row._id, collection);
  return row;
}

export function planCollectionSimplification(
  snapshot: SimplificationSnapshot,
): SimplificationPlan {
  const indexes = Object.fromEntries(
    SIMPLIFICATION_COLLECTIONS.map((name) => [
      name,
      index(snapshot[name], name),
    ]),
  ) as Record<SimplificationCollection, Map<string, MigrationRow>>;
  const changes: SimplificationChange[] = [];
  const users = indexes.user;
  const departments = indexes.department;
  const years = indexes.academic_year;
  const parent = (
    value: unknown,
    rows: Map<string, MigrationRow>,
    collection: SimplificationCollection,
  ) => rows.get(id(value, collection)) ?? fail("ORPHAN_PARENT", collection);

  /**
   * Concurrency: timestamp ordering — write rule.
   * Rule: retain the maximum parent and embedded source readTs/writeTs.
   * Pass: migrated parent writes remain subject to every source guard.
   */
  const merge = (
    collection: "user" | "department" | "step_verification",
    before: MigrationRow,
    set: Record<string, unknown>,
  ) => {
    const embedded =
      collection === "user"
        ? [set.studentProfile]
        : collection === "department" && Array.isArray(set.advisers)
          ? set.advisers
          : [];
    const merged = { ...set };
    for (const field of ["readTs", "writeTs"] as const) {
      const clocks = [before, ...embedded].flatMap((row) => {
        if (!row || typeof row !== "object") return [];
        const clock = (row as MigrationRow)[field];
        return typeof clock === "number" && Number.isFinite(clock)
          ? [clock]
          : [];
      });
      if (clocks.length) merged[field] = Math.max(...clocks);
    }
    const after = { ...before, ...merged };
    if (!isDeepStrictEqual(before, after)) {
      changes.push({ collection, before, after, set: merged });
    }
  };

  const profiles = new Map<string, { row: MigrationRow; owner: string }>();
  const numbers = new Map<string, string>();
  const validateProfile = (row: MigrationRow, owner: MigrationRow) => {
    const key = id(row._id, "student_profile");
    if (
      typeof row.studentNumber !== "string" ||
      !STUDENT_NUMBER_PATTERN.test(row.studentNumber)
    )
      fail("INVALID_STUDENT_NUMBER", "student_profile");
    parent(row.academicYearId, years, "student_profile");
    const ownerKey = id(owner._id, "user");
    const previous = profiles.get(key);
    if (
      previous &&
      (previous.owner !== ownerKey || !isDeepStrictEqual(previous.row, row))
    ) {
      fail("AMBIGUOUS_PROFILE_OWNERSHIP", "student_profile");
    }
    if (
      numbers.has(row.studentNumber) &&
      numbers.get(row.studentNumber) !== key
    ) {
      fail("DUPLICATE_STUDENT_NUMBER", "student_profile");
    }
    profiles.set(key, { row, owner: ownerKey });
    numbers.set(row.studentNumber, key);
  };
  for (const user of snapshot.user) {
    if (user.studentProfile !== undefined && user.studentProfile !== null) {
      const profile = embedded(user.studentProfile, "user");
      if ("userId" in profile) fail("INVALID_EMBEDDED_ROW", "user");
      validateProfile(profile, user);
    }
  }
  const sourceOwners = new Set<string>();
  for (const source of snapshot.student_profile) {
    const owner = parent(source.userId, users, "student_profile");
    const ownerKey = id(owner._id, "user");
    if (sourceOwners.has(ownerKey))
      fail("AMBIGUOUS_PROFILE_OWNERSHIP", "student_profile");
    sourceOwners.add(ownerKey);
    const profile = without(source, ["userId"]);
    validateProfile(profile, owner);
    if (owner.studentProfile !== undefined && owner.studentProfile !== null) {
      if (!isDeepStrictEqual(owner.studentProfile, profile)) {
        fail("DESTINATION_CONFLICT", "user");
      }
    }
    merge("user", owner, { studentProfile: profile });
  }

  const assignments = new Map<string, MigrationRow[]>();
  const assignmentIds = new Map<string, string>();

  const addAssignment = (
    department: MigrationRow,
    assignment: MigrationRow,
  ) => {
    const departmentKey = id(department._id, "department");
    const adviserKey = id(assignment.adviserId, "adviser_department");
    parent(assignment.adviserId, users, "adviser_department");
    const key = id(assignment._id, "adviser_department");
    if (assignmentIds.has(key) && assignmentIds.get(key) !== departmentKey) {
      fail("ID_COLLISION", "adviser_department");
    }

    const allowed = levels(department.yearLevels, "department");
    const assigned = levels(assignment.yearLevels, "adviser_department");
    if (allowed.length && assigned.some((level) => !allowed.includes(level))) {
      fail("INVALID_ASSIGNMENT", "adviser_department");
    }
    const rows = assignments.get(departmentKey) ?? [];
    const existing = rows.find(
      (row) => id(row.adviserId, "adviser_department") === adviserKey,
    );
    if (existing) {
      if (!isDeepStrictEqual(existing, assignment))
        fail("DESTINATION_CONFLICT", "department");
      return;
    }
    if (
      rows.some((row) =>
        yearLevelsOverlap(
          levels(row.yearLevels, "adviser_department"),
          assigned,
        ),
      )
    ) {
      fail("ASSIGNMENT_OVERLAP", "adviser_department");
    }
    if (rows.some((row) => id(row._id, "adviser_department") === key)) {
      fail("ID_COLLISION", "adviser_department");
    }
    rows.push(assignment);
    assignments.set(departmentKey, rows);
    assignmentIds.set(key, departmentKey);
  };
  for (const department of snapshot.department) {
    if (department.advisers !== undefined) {
      if (!Array.isArray(department.advisers))
        fail("INVALID_EMBEDDED_ROW", "department");
      const seen = new Set<string>();
      for (const value of department.advisers) {
        const assignment = embedded(value, "department");
        if ("departmentId" in assignment)
          fail("INVALID_EMBEDDED_ROW", "department");
        const key = id(assignment.adviserId, "department");
        if (seen.has(key)) fail("DUPLICATE_ASSIGNMENT", "department");
        seen.add(key);
        addAssignment(department, assignment);
      }
    }
  }
  const sourceAssignments = new Set<string>();
  for (const source of snapshot.adviser_department) {
    const department = parent(
      source.departmentId,
      departments,
      "adviser_department",
    );
    const tuple = JSON.stringify([
      id(source.departmentId, "adviser_department"),
      id(source.adviserId, "adviser_department"),
    ]);
    if (sourceAssignments.has(tuple))
      fail("DUPLICATE_ASSIGNMENT", "adviser_department");
    sourceAssignments.add(tuple);
    addAssignment(department, without(source, ["departmentId"]));
  }
  for (const department of snapshot.department) {
    const desired = assignments.get(id(department._id, "department")) ?? [];
    if (desired.length) {
      merge("department", department, { advisers: desired });
    }
  }

  const reconcile = (
    collection: "content" | "adviser_schedule",
    row: MigrationRow,
  ) => {
    const key = id(row._id, collection);
    const existing = indexes[collection].get(key);
    if (existing) {
      if (!isDeepStrictEqual(existing, row))
        fail("DESTINATION_CONFLICT", collection);
    } else {
      indexes[collection].set(key, row);
      changes.push({ collection, before: null, after: row, set: {} });
    }
  };
  for (const row of snapshot.requirement_item) {
    if ("kind" in row) fail("RESERVED_DISCRIMINATOR", "requirement_item");
    reconcile("content", { ...row, kind: "requirement" });
  }
  for (const row of snapshot.social_media_link) {
    if ("kind" in row) fail("RESERVED_DISCRIMINATOR", "social_media_link");
    reconcile("content", { ...row, kind: "socialLink" });
  }
  for (const row of indexes.content.values()) {
    if (row.kind !== "requirement" && row.kind !== "socialLink") {
      fail("UNKNOWN_KIND", "content");
    }
  }
  for (const row of snapshot.adviser_availability) {
    if ("kind" in row) fail("RESERVED_DISCRIMINATOR", "adviser_availability");
    reconcile("adviser_schedule", { ...row, kind: "presence" });
  }
  for (const row of snapshot.availability_window) {
    if ("windowKind" in row)
      fail("RESERVED_DISCRIMINATOR", "availability_window");
    reconcile("adviser_schedule", {
      ...row,
      kind: "window",
      windowKind: row.kind,
    });
  }
  const presenceTuples = new Set<string>();
  const windowGroups = new Map<string, ScheduleWindow[]>();
  for (const row of indexes.adviser_schedule.values()) {
    parent(row.adviserId, users, "adviser_schedule");
    parent(row.departmentId, departments, "adviser_schedule");
    parent(row.academicYearId, years, "adviser_schedule");
    const tuple = JSON.stringify([
      id(row.adviserId, "adviser_schedule"),
      id(row.departmentId, "adviser_schedule"),
      id(row.academicYearId, "adviser_schedule"),
    ]);
    if (row.kind === "presence") {
      if (typeof row.isOpen !== "boolean")
        fail("INVALID_PRESENCE", "adviser_schedule");
      if (presenceTuples.has(tuple))
        fail("DUPLICATE_PRESENCE_TUPLE", "adviser_schedule");
      presenceTuples.add(tuple);
    } else if (row.kind === "window") {
      if (!["WEEKLY", "EXTRA", "CANCEL"].includes(String(row.windowKind))) {
        fail("UNKNOWN_WINDOW_KIND", "adviser_schedule");
      }
      const rows = windowGroups.get(tuple) ?? [];
      rows.push({ ...row, kind: row.windowKind } as ScheduleWindow);
      windowGroups.set(tuple, rows);
    } else fail("UNKNOWN_KIND", "adviser_schedule");
  }
  for (const rows of windowGroups.values()) {
    try {
      validateWindows(rows);
    } catch {
      fail("INVALID_WINDOWS_OR_OVERLAP", "adviser_schedule");
    }
  }

  const stepMap = new Map<string, string>();
  const codes = new Set<string>();
  for (const row of snapshot.step) {
    if (
      typeof row.code !== "string" ||
      !(STEP_CODES as readonly string[]).includes(row.code)
    ) {
      fail("UNKNOWN_STEP", "step");
    }
    if (codes.has(row.code)) fail("DUPLICATE_STEP_CODE", "step");
    codes.add(row.code);
    const key = id(row._id, "step");
    if ((STEP_CODES as readonly string[]).includes(key) && key !== row.code) {
      fail("AMBIGUOUS_STEP_REFERENCE", "step");
    }
    stepMap.set(key, row.code);
  }
  const verificationTuples = new Set<string>();
  for (const row of snapshot.step_verification) {
    const key = id(row.stepId, "step_verification");
    const code =
      stepMap.get(key) ??
      ((STEP_CODES as readonly string[]).includes(key) ? key : undefined);
    if (!code) fail("DANGLING_STEP_REFERENCE", "step_verification");
    const profileKey = id(row.studentProfileId, "step_verification");
    if (!profiles.has(profileKey)) fail("ORPHAN_PARENT", "step_verification");
    parent(row.academicYearId, years, "step_verification");
    const tuple = JSON.stringify([
      profileKey,
      code,
      id(row.academicYearId, "step_verification"),
    ]);
    if (verificationTuples.has(tuple))
      fail("DUPLICATE_VERIFICATION_TUPLE", "step_verification");
    verificationTuples.add(tuple);
    if (row.stepId !== code) merge("step_verification", row, { stepId: code });
  }
  for (const row of snapshot.student_enrollment) {
    if (!profiles.has(id(row.studentProfileId, "student_enrollment"))) {
      fail("ORPHAN_PARENT", "student_enrollment");
    }
    parent(row.academicYearId, years, "student_enrollment");
    parent(row.departmentId, departments, "student_enrollment");
  }
  return {
    changes,
    summary: {
      sourceRows: [
        "student_profile",
        "adviser_department",
        "requirement_item",
        "social_media_link",
        "adviser_availability",
        "availability_window",
        "step",
        "step_verification",
      ].reduce(
        (count, name) =>
          count + snapshot[name as SimplificationCollection].length,
        0,
      ),
      parentMerges: changes.filter(
        (change) =>
          change.collection === "user" || change.collection === "department",
      ).length,
      destinationInserts: changes.filter((change) => change.before === null)
        .length,
      stepReferencesRemapped: changes.filter(
        (change) => change.collection === "step_verification",
      ).length,
    },
  };
}

export function expectedSimplificationSnapshot(
  snapshot: SimplificationSnapshot,
  plan: SimplificationPlan,
): SimplificationSnapshot {
  const result = Object.fromEntries(
    SIMPLIFICATION_COLLECTIONS.map((name) => [name, [...snapshot[name]]]),
  ) as SimplificationSnapshot;
  for (const change of plan.changes) {
    if (change.before === null) result[change.collection].push(change.after);
    else {
      const position = result[change.collection].findIndex((row) =>
        isDeepStrictEqual(row._id, change.before!._id),
      );
      if (
        position < 0 ||
        !isDeepStrictEqual(result[change.collection][position], change.before)
      ) {
        fail("PLAN_SNAPSHOT_MISMATCH", change.collection);
      }
      result[change.collection][position] = change.after;
    }
  }
  return result;
}

export function verifySimplificationSnapshot(
  expected: SimplificationSnapshot,
  actual: SimplificationSnapshot,
): void {
  for (const collection of SIMPLIFICATION_COLLECTIONS) {
    const wanted = index(expected[collection], collection);
    const found = index(actual[collection], collection);
    if (wanted.size !== found.size) fail("VERIFICATION_MISMATCH", collection);
    for (const [key, row] of wanted) {
      if (!isDeepStrictEqual(row, found.get(key)))
        fail("VERIFICATION_MISMATCH", collection);
    }
  }
  if (planCollectionSimplification(actual).changes.length) {
    fail("VERIFICATION_INCOMPLETE", "user");
  }
}
