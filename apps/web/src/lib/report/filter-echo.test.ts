import { describe, expect, it } from "vitest";
import {
  PRE_ENROLLMENT_STEP_CODES,
  YEAR_LEVELS,
  YEAR_LEVEL_LABELS,
  stepLabel,
} from "$lib/domain/constants";
import type { FilterEchoEntry } from "$lib/report/download";
import { reportFilterEcho } from "./filter-echo";
import { defaultFilterValueFor } from "./filter-config";
import type { ReportDepartment, ReportFilterValue } from "./filter-config";
import { ADMIN_REPORTS, INSTRUCTOR_REPORTS, OFFICER_REPORTS } from "./types";
import type { ReportDef, ReportRole } from "./types";

const stepRegister = OFFICER_REPORTS.find((r) => r.kind === "step-register")!;
const userDirectory = ADMIN_REPORTS.find((r) => r.kind === "user-directory")!;
const roster = INSTRUCTOR_REPORTS.find((r) => r.kind === "roster")!;

function echo(
  def: ReportDef,
  role: ReportRole,
  patch: Partial<ReportFilterValue> = {},
  departments: readonly ReportDepartment[] = [],
) {
  return reportFilterEcho(
    { ...defaultFilterValueFor(role), ...patch },
    def,
    departments,
    role,
  );
}

function value(entries: readonly FilterEchoEntry[], label: string): string {
  return entries.find((e) => e.label === label)?.value ?? "";
}

describe("reportFilterEcho", () => {
  it("prints nothing for every control left at its default", () => {
    expect(echo(stepRegister, "officer").every((e) => e.value === "")).toBe(
      true,
    );
  });

  it("echoes only the filters the report declares, in order", () => {
    const entries = echo(stepRegister, "officer", {
      step: PRE_ENROLLMENT_STEP_CODES[0],
    });
    expect(entries.map((e) => e.label)).toEqual([
      "Step",
      "Search",
      "Status",
      "Evidence",
      "Submitted",
      "Sort",
    ]);
    expect(value(entries, "Step")).toBe(
      stepLabel(PRE_ENROLLMENT_STEP_CODES[0]),
    );
  });

  it("trims the search query", () => {
    expect(
      value(echo(stepRegister, "officer", { q: "  maria  " }), "Search"),
    ).toBe("maria");
  });

  it("keeps the role's own default sort silent and prints any other", () => {
    expect(
      value(echo(stepRegister, "officer", { sort: "submittedAt:asc" }), "Sort"),
    ).toBe("");
    expect(
      value(
        echo(stepRegister, "officer", { sort: "studentName:desc" }),
        "Sort",
      ),
    ).toBe("Student name (Z-A)");
  });

  it("counts selected departments rather than listing them", () => {
    expect(
      value(echo(roster, "instructor", { departments: ["a", "b"] }), "Course"),
    ).toBe("2 selected");
  });

  it("resolves the admin's course id to the department code", () => {
    const departments: ReportDepartment[] = [
      { id: "d1", code: "CS", name: "Computer Science" },
    ];
    expect(
      value(
        echo(userDirectory, "admin", { course: "d1" }, departments),
        "Course",
      ),
    ).toBe("CS");
  });

  it("prints the year level label", () => {
    const level = YEAR_LEVELS[0];
    expect(
      value(echo(roster, "instructor", { yearLevels: [level] }), "Year level"),
    ).toBe(YEAR_LEVEL_LABELS[level]);
  });

  it("prints the scope only when it widens past the default", () => {
    expect(value(echo(roster, "instructor", { scope: "mine" }), "Scope")).toBe(
      "",
    );
    expect(value(echo(roster, "instructor", { scope: "all" }), "Scope")).toBe(
      "All departments",
    );
  });

  it("prints the enrolled segment and the unassigned toggle", () => {
    expect(
      value(echo(roster, "instructor", { enrolled: "enrolled" }), "Enrolled"),
    ).toBe("Enrolled");
    expect(
      value(echo(roster, "instructor", { unassigned: true }), "Unassigned"),
    ).toBe("Only unassigned");
  });
});
