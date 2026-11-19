import { describe, expect, it } from "vitest";
import { shouldGateOnboarding } from "./onboarding-gate";
import type { MyStepsData } from "./types";

function makeData(over: {
  studentNumber?: string | null;
  derivedStudentNumber?: string | null;
  enrollment?: { academicYearId: string; yearLevel: string } | null;
  enrollments?: { academicYearId: string; yearLevel: string }[];
  hasActiveYear?: boolean;
  academicYearId?: string | null;
}): MyStepsData {
  const enrollments = over.enrollments ?? [];
  return {
    profile: {
      studentNumber: over.studentNumber ?? null,
      derivedStudentNumber: over.derivedStudentNumber ?? null,
      isOutsideOrg: false,
      enrollment: over.enrollment ?? null,
      enrollments,
    },
    hasActiveYear: over.hasActiveYear ?? true,
    academicYearId: over.academicYearId ?? "AY-2026",
    academicYearLabel: "2025-2026",
    semesterLabel: "1st Semester",
    steps: [],
    readyForQueue: false,
    allComplete: false,
  } as unknown as MyStepsData;
}

const gate = (data: MyStepsData, role = "STUDENT", dismissed = false) =>
  shouldGateOnboarding({ data, role, dismissed });

describe("shouldGateOnboarding", () => {
  describe("non-student roles", () => {
    it("never gates an instructor or officer", () => {
      const empty = makeData({ studentNumber: null, enrollment: null });
      expect(gate(empty, "ENROLLMENT_ADVISER")).toBe(false);
      expect(gate(empty, "SBO_OFFICER")).toBe(false);
      expect(gate(empty, "ADMIN")).toBe(false);
    });
  });

  describe("a first-time Google student (no profile at all)", () => {
    it("gates so the year-level/course modal is shown", () => {
      expect(gate(makeData({ studentNumber: null, enrollment: null }))).toBe(
        true,
      );
    });

    it("still gates an outside-org (personal email) student", () => {
      const data = makeData({ studentNumber: null, enrollment: null });
      data.profile.isOutsideOrg = true;
      expect(gate(data)).toBe(true);
    });

    it("does not gate once the account is dismissed for the session", () => {
      expect(
        gate(
          makeData({ studentNumber: null, enrollment: null }),
          "STUDENT",
          true,
        ),
      ).toBe(false);
    });
  });

  describe("partial accounts", () => {
    it("gates when the student number is missing", () => {
      expect(
        gate(
          makeData({
            studentNumber: null,
            enrollment: { academicYearId: "AY-2026", yearLevel: "FIRST" },
          }),
        ),
      ).toBe(true);
    });

    it("gates when only the number is set but the active year has no record", () => {
      expect(gate(makeData({ studentNumber: "2401117979" }))).toBe(true);
    });

    it("does not gate a fully placed student", () => {
      const enrollment = { academicYearId: "AY-2026", yearLevel: "FIRST" };
      expect(
        gate(
          makeData({
            studentNumber: "2401117979",
            enrollment,
            enrollments: [enrollment],
          }),
        ),
      ).toBe(false);
    });
  });

  describe("returning student in a new active year", () => {
    it("gates again when the only record is from an earlier year", () => {
      const previous = { academicYearId: "AY-2025", yearLevel: "FIRST" };
      expect(
        gate(
          makeData({
            studentNumber: "2401117979",
            enrollment: previous,
            enrollments: [previous],
            academicYearId: "AY-2026",
          }),
        ),
      ).toBe(true);
    });

    it("does not gate when an active-year record exists alongside older ones", () => {
      const current = { academicYearId: "AY-2026", yearLevel: "SECOND" };
      const previous = { academicYearId: "AY-2025", yearLevel: "FIRST" };
      expect(
        gate(
          makeData({
            studentNumber: "2401117979",
            enrollment: current,
            enrollments: [current, previous],
            academicYearId: "AY-2026",
          }),
        ),
      ).toBe(false);
    });
  });

  describe("no active academic year configured", () => {
    it("gates so the modal can show the AY-less state", () => {
      expect(
        gate(
          makeData({
            studentNumber: "2401117979",
            enrollment: null,
            hasActiveYear: false,
            academicYearId: null,
          }),
        ),
      ).toBe(true);
    });
  });

  describe("a derivable student number", () => {
    const enrolled = { academicYearId: "AY-2026", yearLevel: "FIRST" };

    it("does not gate on the number when the year is enrolled", () => {
      expect(
        gate(
          makeData({
            studentNumber: null,
            derivedStudentNumber: "2401117078",
            enrollment: enrolled,
            enrollments: [enrolled],
          }),
        ),
      ).toBe(false);
    });

    it("still gates on the enrollment, which an email cannot supply", () => {
      expect(
        gate(
          makeData({
            studentNumber: null,
            derivedStudentNumber: "2401117078",
            enrollment: null,
          }),
        ),
      ).toBe(true);
    });

    it("still gates when only an earlier year is enrolled", () => {
      const previous = { academicYearId: "AY-2025", yearLevel: "FIRST" };
      expect(
        gate(
          makeData({
            studentNumber: null,
            derivedStudentNumber: "2401117078",
            enrollment: previous,
            enrollments: [previous],
            academicYearId: "AY-2026",
          }),
        ),
      ).toBe(true);
    });

    it("gates like any other student when the address yields nothing", () => {
      expect(
        gate(
          makeData({
            studentNumber: null,
            derivedStudentNumber: null,
            enrollment: enrolled,
            enrollments: [enrolled],
          }),
        ),
      ).toBe(true);
    });
  });
});
