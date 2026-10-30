import { describe, expect, it } from "vitest";
import { buildReportFilename } from "./filename";
import {
  ADMIN_REPORTS,
  INSTRUCTOR_REPORTS,
  OFFICER_REPORTS,
  STUDENT_REPORTS,
  reportsForRole,
  type ReportKind,
} from "./types";

describe("buildReportFilename", () => {
  it("keeps the step code as the discriminator for the step register", () => {
    expect(
      buildReportFilename({
        role: "officer",
        reportId: "step-register",
        discriminator: "ASSESSMENT",
        date: "2026-09-26T02:00:00Z",
      }),
    ).toBe("officer-step-register-assessment-2026-09-26.pdf");
  });

  it("slugs a student name for the verification record", () => {
    expect(
      buildReportFilename({
        role: "instructor",
        reportId: "record",
        discriminator: "Dela Cruz, Juan",
        date: "2026-09-26T02:00:00Z",
      }),
    ).toBe("instructor-record-dela-cruz-juan-2026-09-26.pdf");
  });

  it("collapses the segment when there is no discriminator", () => {
    expect(
      buildReportFilename({
        role: "admin",
        reportId: "user-directory",
        date: "2026-09-26T02:00:00Z",
      }),
    ).toBe("admin-user-directory-2026-09-26.pdf");
  });

  it("collapses the segment when the discriminator is empty or only punctuation", () => {
    const expected = "officer-step-summary-2026-09-26.pdf";
    expect(
      buildReportFilename({
        role: "officer",
        reportId: "step-summary",
        discriminator: null,
        date: "2026-09-26T02:00:00Z",
      }),
    ).toBe(expected);
    expect(
      buildReportFilename({
        role: "officer",
        reportId: "step-summary",
        discriminator: "",
        date: "2026-09-26T02:00:00Z",
      }),
    ).toBe(expected);
    expect(
      buildReportFilename({
        role: "officer",
        reportId: "step-summary",
        discriminator: "   ***   ",
        date: "2026-09-26T02:00:00Z",
      }),
    ).toBe(expected);
  });

  it("strips apostrophes and other punctuation from a name", () => {
    expect(
      buildReportFilename({
        role: "instructor",
        reportId: "record",
        discriminator: "O'Brien / Santos Jr.",
        date: "2026-09-26T02:00:00Z",
      }),
    ).toBe("instructor-record-o-brien-santos-jr-2026-09-26.pdf");
  });

  it("uses the Manila calendar date, not the UTC one", () => {
    // 18:00Z on the 25th is already the 26th in Manila (UTC+8).
    expect(
      buildReportFilename({
        role: "officer",
        reportId: "step-register",
        discriminator: "ASSESSMENT",
        date: "2026-09-25T18:00:00Z",
      }),
    ).toBe("officer-step-register-assessment-2026-09-26.pdf");
  });

  it("rolls forward a day when Manila has already passed the UTC date", () => {
    // 20:00Z on the 26th is 04:00 on the 27th in Manila.
    expect(
      buildReportFilename({
        role: "admin",
        reportId: "user-directory",
        date: "2026-09-26T20:00:00Z",
      }),
    ).toBe("admin-user-directory-2026-09-27.pdf");
  });

  it("accepts a Date as well as an ISO string", () => {
    const date = new Date("2026-09-25T18:00:00Z");
    expect(
      buildReportFilename({ role: "admin", reportId: "user-directory", date }),
    ).toBe("admin-user-directory-2026-09-26.pdf");
  });

  it("produces a name for every catalogue report", () => {
    const all = [
      ...OFFICER_REPORTS,
      ...INSTRUCTOR_REPORTS,
      ...ADMIN_REPORTS,
      ...STUDENT_REPORTS,
    ];
    for (const def of all) {
      const name = buildReportFilename({
        role: def.role,
        reportId: def.kind,
        date: "2026-09-26T02:00:00Z",
      });
      expect(name).toBe(`${def.role}-${def.kind}-2026-09-26.pdf`);
      expect(name).toMatch(/^[a-z0-9-]+\.pdf$/);
    }
  });
});

describe("reportsForRole", () => {
  it("returns only that role's reports, correctly tagged", () => {
    const kinds: Record<string, ReportKind[]> = {
      officer: ["record", "step-summary", "step-register"],
      instructor: ["record", "roster"],
      admin: ["record", "enrollment-summary", "user-directory"],
      student: ["record"],
    };
    for (const [role, expected] of Object.entries(kinds)) {
      const defs = reportsForRole(
        role as "officer" | "instructor" | "admin" | "student",
      );
      expect(defs.map((def) => def.kind)).toEqual(expected);
      for (const def of defs) expect(def.role).toBe(role);
    }
  });
});

describe("the student record filename", () => {
  it("slugs the student number as the discriminator", () => {
    expect(
      buildReportFilename({
        role: "student",
        reportId: "record",
        discriminator: "2401117078",
        date: "2026-09-26T02:00:00Z",
      }),
    ).toBe("student-record-2401117078-2026-09-26.pdf");
  });

  it("falls back to the slugified name when there is no number", () => {
    expect(
      buildReportFilename({
        role: "student",
        reportId: "record",
        discriminator: "Juan Dela Cruz",
        date: "2026-09-26T02:00:00Z",
      }),
    ).toBe("student-record-juan-dela-cruz-2026-09-26.pdf");
  });
});
