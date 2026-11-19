import { describe, expect, it } from "vitest";

import {
  DEFAULT_REPORT_FILTER_VALUE,
  defaultFilterValueFor,
  type ReportFilterValue,
} from "./filter-config";
import {
  readReportFilterValue,
  reportFilterUpdates,
  splitSort,
} from "./filter-params";
import { type ReportRole } from "$lib/report/types";

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

/** read -> write -> read. The property that matters: a shared link survives. */
function roundTrip(
  role: ReportRole,
  value: ReportFilterValue,
  from = new URLSearchParams(),
): ReportFilterValue {
  const written = apply(from, reportFilterUpdates(value, role));
  return readReportFilterValue(written, role, value.scope);
}

describe("splitSort", () => {
  it("splits the combined sort value", () => {
    expect(splitSort("submittedAt:desc")).toEqual({
      sort: "submittedAt",
      dir: "desc",
    });
  });

  it("defaults a bare field to ascending", () => {
    expect(splitSort("name")).toEqual({ sort: "name", dir: "asc" });
  });

  it("treats anything but desc as asc", () => {
    expect(splitSort("name:sideways")).toEqual({ sort: "name", dir: "asc" });
  });

  it("splits on the LAST colon, so a field may contain one", () => {
    expect(splitSort("a:b:desc")).toEqual({ sort: "a:b", dir: "desc" });
  });
});

describe("officer filter params", () => {
  const role = "officer" as const;

  it("reads every declared control off the URL", () => {
    const params = new URLSearchParams(
      "rstep=CONSENT&q=reyes&status=VERIFIED&evidence=HAS&range=30d&sort=studentName&dir=desc",
    );

    expect(readReportFilterValue(params, role, "mine")).toMatchObject({
      step: "CONSENT",
      q: "reyes",
      status: "VERIFIED",
      evidence: "HAS",
      range: "30d",
      sort: "studentName:desc",
    });
  });

  it("keeps the step out of ?step=, which the officer console reads as its tab", () => {
    const params = apply(
      new URLSearchParams(),
      reportFilterUpdates(
        { ...DEFAULT_REPORT_FILTER_VALUE, step: "MUGSHOT" },
        role,
      ),
    );
    expect(params.get("rstep")).toBe("MUGSHOT");
    expect(params.has("step")).toBe(false);
  });

  it("omits defaults so the URL stays as short as the live list's", () => {
    const params = apply(
      new URLSearchParams(),
      reportFilterUpdates(defaultFilterValueFor(role), role),
    );
    expect([...params.keys()]).toEqual([]);
  });

  it("round-trips a fully narrowed register", () => {
    const value: ReportFilterValue = {
      ...defaultFilterValueFor(role),
      step: "PROFILING",
      q: "santos",
      status: "RETURNED",
      evidence: "NONE",
      range: "7d",
      sort: "status:asc",
    };
    expect(roundTrip(role, value)).toEqual(value);
  });

  it("clears the admin-only params an officer never offers", () => {
    const params = apply(
      new URLSearchParams(
        "role=STUDENT&outside=OUTSIDE&dept=bsit&levels=THIRD",
      ),
      reportFilterUpdates(defaultFilterValueFor(role), role),
    );
    expect(params.has("role")).toBe(false);
    expect(params.has("outside")).toBe(false);
    expect(params.has("dept")).toBe(false);
    expect(params.has("levels")).toBe(false);
  });
});

describe("instructor filter params", () => {
  const role = "instructor" as const;

  it("reads the Students tab's own params, plus ?scope=", () => {
    const params = new URLSearchParams(
      "tab=reports&report=roster&scope=all&depts=bsit&levels=THIRD&buckets=IN_PROGRESS&step=MUGSHOT&stepState=SUBMITTED&enrolled=not&unassigned=1&q=dela&sort=stepsVerified&dir=desc",
    );

    expect(readReportFilterValue(params, role, "all")).toMatchObject({
      departments: ["bsit"],
      yearLevels: ["THIRD"],
      buckets: ["IN_PROGRESS"],
      step: "MUGSHOT",
      stepState: "SUBMITTED",
      enrolled: "not_enrolled",
      unassigned: true,
      q: "dela",
      sort: "stepsVerified:desc",
      scope: "all",
    });
  });

  it("round-trips a fully narrowed roster", () => {
    const value: ReportFilterValue = {
      ...defaultFilterValueFor(role),
      departments: ["bsit", "bscs"],
      yearLevels: ["SECOND", "THIRD"],
      buckets: ["ENROLLED"],
      step: "CONSENT",
      stepState: "VERIFIED",
      enrolled: "enrolled",
      unassigned: true,
      q: "reyes",
      sort: "enrolledAt:desc",
      scope: "all",
    };
    expect(roundTrip(role, value)).toEqual(value);
  });

  it("writes ?scope=all but leaves the default off the URL", () => {
    expect(
      apply(
        new URLSearchParams(),
        reportFilterUpdates(
          { ...defaultFilterValueFor(role), scope: "all" },
          role,
        ),
      ).get("scope"),
    ).toBe("all");
    expect(
      apply(
        new URLSearchParams(),
        reportFilterUpdates(defaultFilterValueFor(role), role),
      ).has("scope"),
    ).toBe(false);
  });

  it("never writes the officer's ?rstep=", () => {
    const params = apply(
      new URLSearchParams("rstep=CONSENT"),
      reportFilterUpdates(defaultFilterValueFor(role), role),
    );
    expect(params.has("rstep")).toBe(false);
  });
});

describe("admin filter params", () => {
  const role = "admin" as const;

  it("reads every declared control off the URL", () => {
    const params = new URLSearchParams(
      "q=admin&role=SBO_OFFICER&outside=OUTSIDE&dept=bsit&levels=THIRD&sort=name&dir=asc",
    );

    expect(readReportFilterValue(params, role, "mine")).toMatchObject({
      q: "admin",
      role: "SBO_OFFICER",
      org: "OUTSIDE",
      course: "bsit",
      yearLevels: ["THIRD"],
      sort: "name:asc",
    });
  });

  it("round-trips a fully narrowed directory", () => {
    const value: ReportFilterValue = {
      ...DEFAULT_REPORT_FILTER_VALUE,
      q: "del",
      role: "STUDENT",
      org: "INSIDE",
      course: "bsit",
      yearLevels: ["FOURTH"],
      sort: "joined:asc",
    };
    expect(roundTrip(role, value)).toEqual(value);
  });

  // The admin procedure takes ONE year level, so its control is a single select:
  // a multi-select let the control offer two levels while the query sent one, and
  // the header echoed both -- a wrong number stated accurately (spec 5.4).
  it("writes the single year level its single-select control holds", () => {
    const params = apply(
      new URLSearchParams(),
      reportFilterUpdates(
        { ...defaultFilterValueFor(role), yearLevels: ["SECOND"] },
        role,
      ),
    );
    expect(params.get("levels")).toBe("SECOND");
  });

  it("drops an unknown level from a hand-edited ?levels=, and keeps only the first known one", () => {
    // Forwarded verbatim, `SIXTH` fails the procedure's z.enum(YEAR_LEVELS),
    // which leaves the panel with no preview and Generate enabled against a
    // call that will throw.
    expect(
      readReportFilterValue(new URLSearchParams("levels=SIXTH"), role, "mine")
        .yearLevels,
    ).toEqual([]);
    expect(
      readReportFilterValue(
        new URLSearchParams("levels=SECOND,SIXTH"),
        role,
        "mine",
      ).yearLevels,
    ).toEqual(["SECOND"]);
    // Two KNOWN levels is still only one, because the control is single-select.
    expect(
      readReportFilterValue(
        new URLSearchParams("levels=SECOND,THIRD"),
        role,
        "mine",
      ).yearLevels,
    ).toEqual(["SECOND"]);
  });

  it("omits the defaults the admin console omits", () => {
    const params = apply(
      new URLSearchParams(),
      reportFilterUpdates(defaultFilterValueFor(role), role),
    );
    expect([...params.keys()]).toEqual([]);
  });
});
