import { describe, expect, it } from "vitest";
import { ObjectId } from "mongodb";
import {
  SIMPLIFICATION_COLLECTIONS,
  expectedSimplificationSnapshot,
  planCollectionSimplification,
  verifySimplificationSnapshot,
  type SimplificationSnapshot,
} from "../../../src/lib/db/collection-simplification.js";
import { parseSimplificationArgs } from "../../../src/scripts/simplify-collections.js";

function fixture(): SimplificationSnapshot {
  const snapshot = Object.fromEntries(
    SIMPLIFICATION_COLLECTIONS.map((name) => [name, []]),
  ) as unknown as SimplificationSnapshot;
  const at = new Date("2026-01-01T00:00:00Z");
  snapshot.user = [{ _id: "student", email: "private@example.test", readTs: 10, writeTs: 9 }, { _id: "adviser" }];
  snapshot.academic_year = [{ _id: "year" }, { _id: "old-year" }];
  snapshot.department = [{ _id: "dept", yearLevels: ["FIRST"], writeTs: 20 }];
  snapshot.student_profile = [{ _id: "profile", userId: "student", studentNumber: "123", academicYearId: "year", createdAt: at, updatedAt: null, readTs: 8, writeTs: 7 }];
  snapshot.adviser_department = [{ _id: "assignment", adviserId: "adviser", departmentId: "dept", yearLevels: ["FIRST"], createdAt: at, readTs: 6, writeTs: 5 }];
  snapshot.requirement_item = [{ _id: "requirement", label: "A requirement", order: 1, isActive: true, createdAt: at }];
  snapshot.social_media_link = [{ _id: "social", name: "Page", url: "https://example.test", order: 1, isActive: false }];
  snapshot.adviser_availability = [{ _id: "presence", adviserId: "adviser", departmentId: "dept", academicYearId: "year", isOpen: true, lastActiveAt: at }];
  snapshot.availability_window = [{ _id: "window", adviserId: "adviser", departmentId: "dept", academicYearId: "year", kind: "WEEKLY", weekday: 1, startMinute: 480, endMinute: 510, createdAt: at }];
  snapshot.step = [{ _id: "legacy-assessment", code: "ASSESSMENT" }];
  snapshot.step_verification = [{ _id: "verification", studentProfileId: "profile", academicYearId: "year", stepId: "legacy-assessment", evidence: [{ fileId: "private-file" }], writeTs: 42 }];
  snapshot.student_enrollment = ["year", "old-year"].map((year) => ({ _id: `enrollment-${year}`, studentProfileId: "profile", academicYearId: year, departmentId: "dept", yearLevel: "FIRST" }));
  return snapshot;
}

function expectFailure(edit: (snapshot: SimplificationSnapshot) => void, code: string) {
  const snapshot = fixture();
  edit(snapshot);
  expect(() => planCollectionSimplification(snapshot)).toThrow(code);
}

describe("collection simplification planner", () => {
  it("preserves IDs, yearly enrollments, timestamps, guards and evidence without mutating inputs", () => {
    const input = fixture();
    const original = fixture();
    const plan = planCollectionSimplification(input);
    const result = expectedSimplificationSnapshot(input, plan);
    expect(input).toEqual(original);
    expect(plan.changes).toHaveLength(7);
    const { userId: _owner, ...profile } = input.student_profile[0]!;
    const { departmentId: _department, ...assignment } = input.adviser_department[0]!;
    expect(result.user[0]).toEqual({ ...input.user[0], studentProfile: profile });
    expect(result.department[0]).toEqual({ ...input.department[0], readTs: 6, advisers: [assignment] });
    expect(result.content).toEqual([{ ...input.requirement_item[0], kind: "requirement" }, { ...input.social_media_link[0], kind: "socialLink" }]);
    expect(result.adviser_schedule).toEqual([{ ...input.adviser_availability[0], kind: "presence" }, { ...input.availability_window[0], kind: "window", windowKind: "WEEKLY" }]);
    expect(result.step_verification[0]).toEqual({ ...input.step_verification[0], stepId: "ASSESSMENT" });
    expect(result.student_enrollment).toEqual(input.student_enrollment);
    expect(result.step).toEqual(input.step);
    verifySimplificationSnapshot(result, result);
  });

  it("lifts migrated guard clocks onto parent documents", () => {
    const snapshot = fixture();
    snapshot.user[0].readTs = 4;
    snapshot.user[0].writeTs = 3;
    snapshot.student_profile[0].readTs = 9;
    snapshot.student_profile[0].writeTs = 8;
    snapshot.department[0].writeTs = 10;
    snapshot.adviser_department[0].readTs = 20;
    snapshot.adviser_department[0].writeTs = 15;
    const expected = expectedSimplificationSnapshot(snapshot, planCollectionSimplification(snapshot));
    expect(expected.user[0]).toMatchObject({ readTs: 9, writeTs: 8 });
    expect(expected.department[0]).toMatchObject({ readTs: 20, writeTs: 15 });
    expect(expected.user[0].studentProfile).toMatchObject({ readTs: 9, writeTs: 8 });
    expected.user[0].readTs = 1;
    expected.user[0].writeTs = 1;
    expected.department[0].readTs = 1;
    expected.department[0].writeTs = 1;
    const resumed = expectedSimplificationSnapshot(expected, planCollectionSimplification(expected));
    expect(resumed.user[0]).toMatchObject({ readTs: 9, writeTs: 8 });
    expect(resumed.department[0]).toMatchObject({ readTs: 20, writeTs: 15 });
  });

  it("is idempotent and resumes a partially applied plan", () => {
    const input = fixture();
    const plan = planCollectionSimplification(input);
    const partial = expectedSimplificationSnapshot(input, { ...plan, changes: plan.changes.slice(0, 3) });
    const resume = planCollectionSimplification(partial);
    expect(resume.changes).toHaveLength(4);
    const complete = expectedSimplificationSnapshot(partial, resume);
    expect(planCollectionSimplification(complete).changes).toEqual([]);
    verifySimplificationSnapshot(expectedSimplificationSnapshot(input, plan), complete);
  });

  it("accepts fresh empty datasets and canonical step references", () => {
    const empty = Object.fromEntries(SIMPLIFICATION_COLLECTIONS.map((name) => [name, []])) as unknown as SimplificationSnapshot;
    expect(planCollectionSimplification(empty).changes).toEqual([]);
    const input = fixture();
    input.step = [];
    input.step_verification[0]!.stepId = "ASSESSMENT";
    expect(planCollectionSimplification(input).summary.stepReferencesRemapped).toBe(0);
  });

  it("allows one adviser in multiple departments and rejects duplicate destination presence tuples", () => {
    const input = fixture();
    input.department.push({ _id: "other-dept" });
    input.adviser_department.push({ ...input.adviser_department[0]!, _id: "other-assignment", departmentId: "other-dept" });
    expect(planCollectionSimplification(input).summary.parentMerges).toBe(3);
    input.adviser_schedule = [{ ...input.adviser_availability[0]!, _id: "destination-presence", kind: "presence" }];
    expect(() => planCollectionSimplification(input)).toThrow("DUPLICATE_PRESENCE_TUPLE");
  });

  it("preserves BSON ObjectIds and rejects ambiguous string/ObjectId aliases", () => {
    const input = fixture();
    const objectId = new ObjectId();
    input.requirement_item[0]!._id = objectId;
    const plan = planCollectionSimplification(input);
    expect(plan.changes.find((change) => change.collection === "content")!.after._id).toEqual(objectId);
    input.requirement_item.push({ _id: objectId.toHexString() });
    expect(() => planCollectionSimplification(input)).toThrow("ID_COLLISION");
  });

  it.each([
    ["destination content collision", (s: SimplificationSnapshot) => { s.social_media_link[0]!._id = "requirement"; }, "DESTINATION_CONFLICT"],
    ["content payload mismatch", (s: SimplificationSnapshot) => { s.content = [{ ...s.requirement_item[0]!, kind: "requirement", label: "different" }]; }, "DESTINATION_CONFLICT"],
    ["profile owner missing", (s: SimplificationSnapshot) => { s.student_profile[0]!.userId = "missing"; }, "ORPHAN_PARENT"],
    ["profile ownership ambiguous", (s: SimplificationSnapshot) => { s.student_profile.push({ ...s.student_profile[0]!, _id: "another-profile" }); }, "AMBIGUOUS_PROFILE_OWNERSHIP"],
    ["profile destination mismatch", (s: SimplificationSnapshot) => { s.user[0]!.studentProfile = { ...s.student_profile[0]!, userId: undefined }; }, "INVALID_EMBEDDED_ROW"],
    ["duplicate number", (s: SimplificationSnapshot) => { s.user.push({ _id: "another" }); s.student_profile.push({ ...s.student_profile[0]!, _id: "another-profile", userId: "another" }); }, "DUPLICATE_STUDENT_NUMBER"],
    ["orphan enrollment", (s: SimplificationSnapshot) => { s.student_enrollment[0]!.studentProfileId = "missing"; }, "ORPHAN_PARENT"],
    ["unknown step", (s: SimplificationSnapshot) => { s.step[0]!.code = "UNKNOWN"; }, "UNKNOWN_STEP"],
    ["duplicate step", (s: SimplificationSnapshot) => { s.step.push({ _id: "another", code: "ASSESSMENT" }); }, "DUPLICATE_STEP_CODE"],
    ["dangling reference", (s: SimplificationSnapshot) => { s.step_verification[0]!.stepId = "missing"; }, "DANGLING_STEP_REFERENCE"],
    ["ambiguous canonical alias", (s: SimplificationSnapshot) => { s.step[0]!._id = "CONSENT"; }, "AMBIGUOUS_STEP_REFERENCE"],
    ["collapsed verification collision", (s: SimplificationSnapshot) => { s.step_verification.push({ ...s.step_verification[0]!, _id: "another", stepId: "ASSESSMENT" }); }, "DUPLICATE_VERIFICATION_TUPLE"],
    ["invalid assignment level", (s: SimplificationSnapshot) => { s.adviser_department[0]!.yearLevels = ["SIXTH"]; }, "INVALID_YEAR_LEVELS"],
    ["outside department level", (s: SimplificationSnapshot) => { s.adviser_department[0]!.yearLevels = ["SECOND"]; }, "INVALID_ASSIGNMENT"],
    ["overlapping assignments", (s: SimplificationSnapshot) => { s.user.push({ _id: "other-adviser" }); s.adviser_department.push({ ...s.adviser_department[0]!, _id: "other-assignment", adviserId: "other-adviser" }); }, "ASSIGNMENT_OVERLAP"],
    ["duplicate assignments", (s: SimplificationSnapshot) => { s.adviser_department.push({ ...s.adviser_department[0]!, _id: "another" }); }, "DUPLICATE_ASSIGNMENT"],
    ["duplicate presence", (s: SimplificationSnapshot) => { s.adviser_availability.push({ ...s.adviser_availability[0]!, _id: "another" }); }, "DUPLICATE_PRESENCE_TUPLE"],
    ["schedule ID collision", (s: SimplificationSnapshot) => { s.availability_window[0]!._id = "presence"; }, "DESTINATION_CONFLICT"],
    ["window overlap", (s: SimplificationSnapshot) => { s.availability_window.push({ ...s.availability_window[0]!, _id: "another" }); }, "INVALID_WINDOWS_OR_OVERLAP"],
    ["invalid window kind", (s: SimplificationSnapshot) => { s.availability_window[0]!.kind = "UNKNOWN"; }, "UNKNOWN_WINDOW_KIND"],
    ["invalid interval", (s: SimplificationSnapshot) => { s.availability_window[0]!.startMinute = 481; }, "INVALID_WINDOWS_OR_OVERLAP"],
  ])("fails closed: %s", (_name, edit, code) => {
    expectFailure(edit, code);
  });

  it("verifies fields, guard timestamps and retained sources rather than counts alone", () => {
    const input = fixture();
    const result = expectedSimplificationSnapshot(input, planCollectionSimplification(input));
    for (const collection of ["user", "content", "student_enrollment", "student_profile"] as const) {
      const altered = { ...result, [collection]: result[collection].map((row, i) => i ? row : { ...row, writeTs: 999 }) };
      expect(() => verifySimplificationSnapshot(result, altered)).toThrow("VERIFICATION_MISMATCH");
    }
  });

  it("remains reconciled while verified sources are retired one at a time", () => {
    const input = fixture();
    const result = expectedSimplificationSnapshot(input, planCollectionSimplification(input));
    for (const name of ["student_profile", "adviser_department", "step", "requirement_item", "social_media_link", "adviser_availability", "availability_window"] as const) {
      result[name] = [];
      expect(planCollectionSimplification(result).changes).toEqual([]);
      verifySimplificationSnapshot(result, result);
    }
    expect(result.student_enrollment).toEqual(input.student_enrollment);
  });

  it("does not expose private documents or identifiers in errors", () => {
    const input = fixture();
    input.student_profile[0]!.userId = "private@example.test";
    try {
      planCollectionSimplification(input);
      expect.fail("Expected failure");
    } catch (error) {
      expect(String(error)).toBe("SimplificationError: ORPHAN_PARENT (student_profile)");
    }
  });
});

describe("offline runner arguments (import has no env or connection side effects)", () => {
  it("defaults to dry-run and requires both explicit apply acknowledgements", () => {
    expect(parseSimplificationArgs([])).toEqual({ apply: false, writersStopped: false });
    expect(parseSimplificationArgs(["--apply", "--writers-stopped", "--backup-reference", "backup-verified"])).toEqual({ apply: true, writersStopped: true, backupReference: "backup-verified" });
  });

  it.each([
    ["--apply"],
    ["--apply", "--writers-stopped"],
    ["--apply", "--backup-reference", "backup"],
    ["--drop"],
    ["--apply=true"],
    ["--dry-run", "--apply"],
    ["--dry-run", "--dry-run"],
    ["--backup-reference"],
    ["--apply", "--writers-stopped", "--backup-reference", " "],
    ["--writers-stopped"],
  ])("rejects unsafe/unknown arguments: %j", (...args) => {
    expect(() => parseSimplificationArgs(args)).toThrow();
  });
});
