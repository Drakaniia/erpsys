import { describe, expect, it } from "vitest";
import {
  buildEnrollmentSummary,
  type EnrollmentSummaryData,
} from "./admin-enrollment-summary";
import type { ContentNode, ReportDocDefinition, ReportMeta } from "../types";

/**
 * Structural assertions on the plain-object docDefinition -- no pdfmake
 * import, no PDF binary (spec 5.19). `header`/`footer` are functions of
 * `(currentPage, pageCount)`, so they are CALLED and the nodes inspected.
 */

function meta(overrides: Partial<ReportMeta> = {}): ReportMeta {
  return {
    title: "Enrollment & Completion Summary",
    generatedBy: "Juan Dela Cruz",
    generatedOn: "26 Sep 2026",
    yearLabel: "2025-2026",
    semester: "1st Sem",
    // R5 has no filters (spec 6.5), so the echo is null and no `Filters:`
    // node may appear anywhere in the document.
    filterEcho: null,
    ...overrides,
  };
}

function overview(
  overrides: Partial<EnrollmentSummaryData> = {},
): EnrollmentSummaryData {
  return {
    roleCounts: {
      STUDENT: 1234,
      SBO_OFFICER: 12,
      ENROLLMENT_ADVISER: 34,
      ADMIN: 5,
    },
    stepTotals: [
      {
        code: "PROFILE",
        name: "Profile Verification",
        order: 1,
        verified: 900,
      },
      {
        code: "ASSESSMENT",
        name: "Assessment Results",
        order: 2,
        verified: 400,
      },
    ],
    departmentTallies: [
      {
        departmentId: "d1",
        name: "Computer Science",
        code: "CS",
        waiting: 7,
        enrolled: 13,
      },
      {
        departmentId: "d2",
        name: "Mechanical Engineering",
        code: "ME",
        waiting: 2,
        enrolled: 4,
      },
    ],
    recentActivity: [
      {
        id: "a1",
        actorName: "Ana Reyes",
        action: "VERIFIED_STUDENT",
        targetRef: "2026-01455",
        at: "2026-03-04T06:32:00.000Z",
      },
    ],
    ...overrides,
  };
}

/**
 * The pdfmake `table` object: the rows are under `table`, and the repeated
 * header row is `headerRows`, a COUNT rather than a boolean flag.
 */
type Table = {
  body?: unknown[][];
  headerRows?: number;
  dontBreakRows?: boolean;
};

/** The document's content, as four section titles each followed by one table. */
function sections(doc: ReportDocDefinition): { title: string; table: Table }[] {
  const out: { title: string; table: Table }[] = [];
  for (const node of doc.content) {
    if (typeof node.text === "string")
      out.push({ title: node.text, table: { body: [] } });
    else out[out.length - 1].table = (node as { table?: Table }).table ?? {};
  }
  return out;
}

function headerCell(row: Table, column: number): string {
  return String(
    (row.body?.[0]?.[column] as { text?: string } | undefined)?.text ??
      row.body?.[0]?.[column],
  );
}

function dataRows(table: Table): unknown[][] {
  return (table.body ?? []).slice(1);
}

function serialise(doc: ReportDocDefinition): string {
  return JSON.stringify({
    pageSize: doc.pageSize,
    pageOrientation: doc.pageOrientation,
    content: doc.content,
    header: doc.header(1, 1),
    footer: doc.footer(1, 1),
  });
}

describe("page setup", () => {
  it("is A4 portrait", () => {
    const doc = buildEnrollmentSummary(overview(), meta());
    expect(doc.pageSize).toBe("A4");
    expect(doc.pageOrientation).toBe("portrait");
  });
});

describe("section order", () => {
  it("carries the four sections in the documented order", () => {
    const doc = buildEnrollmentSummary(overview(), meta());
    expect(sections(doc).map((s) => s.title)).toEqual([
      "Users by role",
      "Verification totals by step",
      "Enrollment by department",
      "Recent admin activity",
    ]);
  });
});

describe("Users by role", () => {
  it("uses the human role labels, not the enum values", () => {
    const doc = buildEnrollmentSummary(overview(), meta());
    const table = sections(doc)[0].table;
    expect(headerCell(table, 0)).toBe("Role");
    expect(dataRows(table).map((r) => r[0])).toEqual([
      "Student",
      "SBO Officer",
      "Instructor",
      "Admin",
    ]);
  });

  it("never prints a raw role enum value in the role column", () => {
    const doc = buildEnrollmentSummary(overview(), meta());
    const text = JSON.stringify(dataRows(sections(doc)[0].table));
    for (const raw of [
      "STUDENT",
      "SBO_OFFICER",
      "ENROLLMENT_ADVISER",
      "ADMIN",
    ]) {
      expect(text).not.toContain(raw);
    }
  });

  it("formats each count locale-grouped", () => {
    const doc = buildEnrollmentSummary(overview(), meta());
    const table = sections(doc)[0].table;
    expect(headerCell(table, 1)).toBe("Users");
    expect(dataRows(table).map((r) => r[1])).toEqual([
      "1,234",
      "12",
      "34",
      "5",
    ]);
  });
});

describe("Verification totals by step", () => {
  it("lists the step name and its verified count", () => {
    const doc = buildEnrollmentSummary(overview(), meta());
    const table = sections(doc)[1].table;
    expect(headerCell(table, 0)).toBe("Step");
    expect(headerCell(table, 1)).toBe("Verified");
    expect(dataRows(table)).toEqual([
      ["Profile Verification", "900"],
      ["Assessment Results", "400"],
    ]);
  });
});

describe("Enrollment by department", () => {
  it("carries the five documented columns", () => {
    const doc = buildEnrollmentSummary(overview(), meta());
    const table = sections(doc)[2].table;
    expect([0, 1, 2, 3, 4].map((c) => headerCell(table, c))).toEqual([
      "Department",
      "Code",
      "Waiting",
      "Enrolled",
      "Total",
    ]);
  });

  it("computes Total as waiting + enrolled", () => {
    const doc = buildEnrollmentSummary(overview(), meta());
    const table = sections(doc)[2].table;
    const rows = dataRows(table);
    expect(rows[0]).toEqual(["Computer Science", "CS", "7", "13", "20"]);
    expect(rows[1]).toEqual(["Mechanical Engineering", "ME", "2", "4", "6"]);

    for (const row of rows) {
      expect(Number(row[4])).toBe(Number(row[2]) + Number(row[3]));
    }
  });

  // The previous version of this test asserted `"total" in tally` on a literal
  // the test itself had just constructed, which is true whatever the builder
  // does. What actually distinguishes a computed total from a payload-supplied
  // one is a payload that LIES about its total.
  it("computes Total itself even when the payload claims a different one", () => {
    const tallyWithTotal = {
      departmentId: "d1",
      name: "Computer Science",
      code: "CS",
      waiting: 7,
      enrolled: 13,
      // A number the report must not print: it is not waiting + enrolled.
      total: 999,
    };
    const doc = buildEnrollmentSummary(
      overview({
        departmentTallies: [
          tallyWithTotal,
        ] as unknown as EnrollmentSummaryData["departmentTallies"],
      }),
      meta(),
    );
    const rows = dataRows(sections(doc)[2].table);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual(["Computer Science", "CS", "7", "13", "20"]);
    expect(JSON.stringify(doc.content)).not.toContain("999");
  });
});

describe("Recent admin activity", () => {
  it("carries When, Actor, Action, Target", () => {
    const doc = buildEnrollmentSummary(overview(), meta());
    const table = sections(doc)[3].table;
    expect([0, 1, 2, 3].map((c) => headerCell(table, c))).toEqual([
      "When",
      "Actor",
      "Action",
      "Target",
    ]);
  });

  it("formats the timestamp and folds actor/target through toWinAnsi", () => {
    const doc = buildEnrollmentSummary(
      overview({
        recentActivity: [
          {
            id: "a1",
            actorName: "Ana \u2019Reyes\u2014Dela",
            action: "VERIFIED_STUDENT",
            targetRef: "2026\u201301455",
            at: "2026-03-04T06:32:00.000Z",
          },
        ],
      }),
      meta(),
    );
    const row = dataRows(sections(doc)[3].table)[0];
    expect(row[0]).toBe("04 Mar 2026, 14:32");
    expect(row[1]).toBe("Ana 'Reyes-Dela");
    expect(row[3]).toBe("2026-01455");
  });
});

describe("filters", () => {
  it("renders no Filters: node anywhere, because R5 has no filters", () => {
    const doc = buildEnrollmentSummary(overview(), meta({ filterEcho: null }));
    expect(serialise(doc)).not.toContain("Filters:");
  });
});

describe("layout", () => {
  it("repeats each header row and never splits a row", () => {
    const doc = buildEnrollmentSummary(overview(), meta());
    for (const { table } of sections(doc)) {
      expect(table.headerRows).toBe(1);
      expect(table.dontBreakRows).toBe(true);
    }
  });

  it("names the generator in the furniture", () => {
    const m = meta();
    const doc = buildEnrollmentSummary(overview(), m);
    expect(doc.info).toEqual({ title: m.title, author: m.generatedBy });
  });

  it("stays inside the WinAnsi repertoire", () => {
    const doc = buildEnrollmentSummary(overview(), meta());
    expect(serialise(doc)).not.toContain("\u2014");
  });
});

describe("empty payloads", () => {
  it("still emits the four sections when nothing matches", () => {
    const doc = buildEnrollmentSummary(
      overview({ stepTotals: [], departmentTallies: [], recentActivity: [] }),
      meta(),
    );
    expect(sections(doc).map((s) => s.title)).toHaveLength(4);
    for (const { table } of sections(doc).slice(1)) {
      expect(table.body).toHaveLength(1);
    }
  });
});

// Type-only guard: the builder's data alias must stay a plain structural type.
const _typeOnly: ContentNode = { text: "ok" };
void _typeOnly;
