import { describe, expect, it } from "vitest";

import {
  DEFAULT_STUDENT_FILTERS,
  readStudentFilters,
  studentFilterUpdates,
  type StudentFilters,
} from "./students";
import {
  REPORTS_TAB_ID,
  readReportKind,
  readReportScope,
  reportKindUpdate,
  reportScopeUpdate,
  reportsTabSelected,
  rosterReportInput,
} from "./reports";
import { INSTRUCTOR_REPORTS, OFFICER_REPORTS } from "../report/types";

/** Applies an update record to a params object the way the panel's `updateUrl` does. */
function apply(
  params: URLSearchParams,
  updates: Record<string, string | null>,
): URLSearchParams {
  const next = new URLSearchParams(params);
  for (const [key, value] of Object.entries(updates)) {
    if (value === null) next.delete(key);
    else next.set(key, value);
  }
  return next;
}

describe("report tab identity", () => {
  it("is selected by ?tab=reports", () => {
    expect(REPORTS_TAB_ID).toBe("reports");
    expect(reportsTabSelected(new URLSearchParams("tab=reports"))).toBe(true);
    expect(reportsTabSelected(new URLSearchParams("tab=students"))).toBe(false);
  });
});

describe("readReportKind", () => {
  const catalog = INSTRUCTOR_REPORTS;

  it("is null when the param is absent", () => {
    expect(readReportKind(new URLSearchParams(), catalog)).toBeNull();
  });

  it("reads a kind the role's catalogue offers", () => {
    expect(readReportKind(new URLSearchParams("report=roster"), catalog)).toBe(
      "roster",
    );
  });

  // The three consoles share one `?report=` namespace but not one catalogue, so
  // a link pasted from the officer console must not resolve to a report the
  // instructor has never heard of.
  it("rejects a kind from another role's catalogue", () => {
    expect(
      readReportKind(new URLSearchParams("report=step-register"), catalog),
    ).toBeNull();
  });

  it("rejects an unknown kind", () => {
    expect(
      readReportKind(new URLSearchParams("report=nonsense"), catalog),
    ).toBeNull();
  });
});

describe("reportKindUpdate", () => {
  it("writes the kind and clears it with null", () => {
    expect(reportKindUpdate("roster")).toEqual({ report: "roster" });
    expect(reportKindUpdate(null)).toEqual({ report: null });
  });

  it("round-trips through the URL", () => {
    const params = apply(new URLSearchParams(), reportKindUpdate("record"));
    expect(readReportKind(params, INSTRUCTOR_REPORTS)).toBe("record");
    expect(apply(params, reportKindUpdate(null)).has("report")).toBe(false);
  });
});

describe("scope", () => {
  it("defaults to the adviser's own departments", () => {
    expect(readReportScope(new URLSearchParams())).toBe("mine");
  });

  it("reads and writes ?scope=all", () => {
    expect(readReportScope(new URLSearchParams("scope=all"))).toBe("all");
    expect(reportScopeUpdate("all")).toEqual({ scope: "all" });
  });

  it("omits the param for the default so a shareable link stays short", () => {
    expect(reportScopeUpdate("mine")).toEqual({ scope: null });
  });
});

describe("rosterReportInput", () => {
  it("sends only the scope and the sort when nothing is filtered", () => {
    expect(rosterReportInput(DEFAULT_STUDENT_FILTERS, "mine")).toEqual({
      scope: "mine",
      sort: "name",
      dir: "asc",
    });
  });

  // Reports are about the ACTIVE year (spec 5.10), so `?ay=` from the Students
  // tab must not become the report's year.
  it("never sends an academic year, even when the filters carry one", () => {
    const input = rosterReportInput(
      { ...DEFAULT_STUDENT_FILTERS, academicYearId: "year-1" },
      "all",
    );
    expect(input).not.toHaveProperty("academicYearId");
    expect(input.scope).toBe("all");
  });

  it("maps the Students tab's vocabulary onto the procedure's", () => {
    const filters: StudentFilters = {
      ...DEFAULT_STUDENT_FILTERS,
      departmentIds: ["bsit"],
      yearLevels: ["THIRD"],
      buckets: ["IN_PROGRESS"],
      stepCode: "MUGSHOT",
      stepState: "RETURNED",
      enrolled: "not_enrolled",
      unassigned: true,
      q: "dela cruz",
      sort: "stepsVerified",
      dir: "desc",
    };

    expect(rosterReportInput(filters, "all")).toEqual({
      scope: "all",
      departmentIds: ["bsit"],
      yearLevels: ["THIRD"],
      buckets: ["IN_PROGRESS"],
      steps: ["MUGSHOT"],
      stepState: "RETURNED",
      enrolled: false,
      unassigned: true,
      q: "dela cruz",
      sort: "stepsVerified",
      dir: "desc",
    });
  });
});

describe("student filter params are reused, not restated", () => {
  const filters: StudentFilters = {
    ...DEFAULT_STUDENT_FILTERS,
    academicYearId: "year-1",
    departmentIds: ["bsit", "bscs"],
    yearLevels: ["SECOND"],
    buckets: ["ENROLLED"],
    stepCode: "CONSENT",
    stepState: "VERIFIED",
    enrolled: "enrolled",
    unassigned: true,
    q: "reyes",
    sort: "yearLevel",
    dir: "desc",
  };

  // The whole point of re-exporting the helpers: a report link and a roster link
  // are the same link plus `report`.
  it("round-trips the Students tab's params unchanged", () => {
    const params = apply(new URLSearchParams(), studentFilterUpdates(filters));
    expect(readStudentFilters(params)).toEqual(filters);
  });

  it("coexists with ?report= and ?scope= in one URL", () => {
    let params = apply(new URLSearchParams(), studentFilterUpdates(filters));
    params = apply(params, reportKindUpdate("roster"));
    params = apply(params, reportScopeUpdate("all"));

    expect(readStudentFilters(params)).toEqual(filters);
    expect(readReportKind(params, INSTRUCTOR_REPORTS)).toBe("roster");
    expect(readReportScope(params)).toBe("all");
  });

  it("uses the same param names the Students tab already writes", () => {
    const params = apply(new URLSearchParams(), studentFilterUpdates(filters));
    expect([...params.keys()].sort()).toEqual([
      "ay",
      "buckets",
      "depts",
      "dir",
      "enrolled",
      "levels",
      "q",
      "sort",
      "step",
      "stepState",
      "unassigned",
    ]);
  });
});

describe("rosterReportInput against a live URL", () => {
  it("builds the call from the params a roster link would carry", () => {
    const params = new URLSearchParams(
      "tab=reports&report=roster&depts=bsit&step=MUGSHOT&stepState=SUBMITTED&enrolled=not&sort=stepsVerified&dir=desc",
    );

    expect(rosterReportInput(readStudentFilters(params), "mine")).toEqual({
      scope: "mine",
      departmentIds: ["bsit"],
      steps: ["MUGSHOT"],
      stepState: "SUBMITTED",
      enrolled: false,
      sort: "stepsVerified",
      dir: "desc",
    });
  });
});

describe("the officer catalogue is unreachable from the instructor console", () => {
  it("lists the officer's three reports", () => {
    expect(OFFICER_REPORTS.map((def) => def.kind)).toEqual([
      "record",
      "step-summary",
      "step-register",
    ]);
  });

  // R1 is deliberately in all three catalogues (spec 5.18) -- one identical
  // record sheet, not three. The other two are the officer's alone.
  it("rejects the officer-only kinds", () => {
    for (const kind of ["step-summary", "step-register"] as const) {
      expect(
        readReportKind(
          new URLSearchParams(`report=${kind}`),
          INSTRUCTOR_REPORTS,
        ),
      ).toBeNull();
    }
  });

  it("still accepts the shared record sheet", () => {
    expect(
      readReportKind(new URLSearchParams("report=record"), INSTRUCTOR_REPORTS),
    ).toBe("record");
  });
});
