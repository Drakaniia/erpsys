// ponytail: test suite >400 lines; split deferred - shared setup/mocks make scenario boundaries unclear without a module-level refactor; leave intact.
import { YEAR_LEVELS } from "$lib/domain/constants";
import { REPORT_ROW_CAP } from "$lib/domain/report";
import { describe, expect, it } from "vitest";
import { BUCKET_LABELS, STEP_STATE_LABELS } from "../../instructor/students";
import { SHORT_STATE_LABELS } from "../format";
import type { ContentNode, ReportDocDefinition, ReportMeta } from "../types";
import {
  buildRosterReport,
  stateOf,
  type RosterReport,
} from "./instructor-roster";

/**
 * Never imports pdfmake and never inspects a PDF binary (spec 5.19). The
 * assertions are on the returned plain object.
 */

type Cell = { text?: string } | string;
type Row = Cell[];

function meta(overrides: Partial<ReportMeta> = {}): ReportMeta {
  return {
    title: "Roster & Progress",
    generatedBy: "Ana Reyes",
    generatedOn: "26 Sep 2026",
    yearLabel: "2025-2026",
    semester: "1st Sem",
    filterEcho: "Year level: 1st Year",
    matchedCount: 2,
    returnedCount: 2,
    truncated: false,
    ...overrides,
  };
}

function stepState(code: string, status: string) {
  return { code, status } as never;
}

function row(overrides: Record<string, unknown> = {}) {
  return {
    studentProfileId: "p1",
    studentName: "Dela Peña",
    studentNumber: "20230001",
    departmentId: "d1",
    departmentName: "BS Information Technology",
    departmentCode: "BSIT",
    yearLevel: "FIRST",
    stepsVerified: 3,
    stepsTotal: 6,
    stepStates: [
      stepState("ASSESSMENT", "VERIFIED"),
      stepState("SOCIAL_MEDIA", "VERIFIED"),
      stepState("PROFILING", "SUBMITTED"),
      stepState("MUGSHOT", "VERIFIED"),
      stepState("CONSENT", "PENDING"),
      stepState("ENROLLMENT", "MISSING"),
    ],
    queueStatus: "WAITING",
    enrolled: false,
    enrolledAt: null,
    pendingReview: 1,
    bucket: "IN_PROGRESS",
    ...overrides,
  };
}

const BASE_STATS = {
  distribution: {
    NOT_STARTED: 4,
    IN_PROGRESS: 2,
    READY_FOR_QUEUE: 1,
    ENROLLED: 3,
  },
  byCourse: [
    {
      departmentId: "d1",
      departmentName: "BS Information Technology",
      departmentCode: "BSIT",
      count: 7,
    },
    {
      departmentId: null,
      departmentName: null,
      departmentCode: null,
      count: 3,
    },
  ],
  byCourseYearLevel: [
    {
      departmentId: "d1",
      departmentName: "BS Information Technology",
      departmentCode: "BSIT",
      counts: { FIRST: 5, SECOND: 1, THIRD: 1, FOURTH: 0, FIFTH: 0 },
      total: 7,
    },
  ],
  unassignedTotal: 3,
  total: 10,
};

function report(overrides: Partial<RosterReport> = {}): RosterReport {
  return {
    year: { id: "ay1", label: "2025-2026", semesterLabel: "1st Sem" },
    rows: [row()] as RosterReport["rows"],
    stats: BASE_STATS as RosterReport["stats"],
    matchedCount: 10,
    truncated: false,
    ...overrides,
  };
}

/**
 * The document's four tables. Rows live under pdfmake's `table` wrapper -- a
 * top-level `body` is not a table to the engine -- so that is where this file
 * looks for one.
 */
type PdfTable = { body?: unknown[]; headerRows?: number };

type PdfTableNode = ContentNode & { table?: PdfTable };

function tables(doc: ReportDocDefinition): PdfTableNode[] {
  return doc.content.filter((node) =>
    Array.isArray((node as PdfTableNode).table?.body),
  ) as PdfTableNode[];
}

function bodyOf(table: PdfTableNode): Row[] {
  return (table.table?.body ?? []) as Row[];
}

/** `simpleTable` emits bare strings; the roster table emits text nodes. */
function textOf(cell: Cell): string {
  return typeof cell === "string" ? cell : String(cell.text ?? "");
}

function headerOf(table: PdfTableNode): string[] {
  return (bodyOf(table)[0] ?? []).map(textOf);
}

function rowOf(table: PdfTableNode, index: number): string[] {
  return (bodyOf(table)[index + 1] ?? []).map(textOf);
}

function sectionNames(doc: ReportDocDefinition): string[] {
  return doc.content
    .filter((node) => node.style === "section")
    .map((node) => String(node.text ?? ""));
}

function serialisable(doc: ReportDocDefinition): string {
  return JSON.stringify({
    ...doc,
    header: doc.header(1, 2),
    footer: doc.footer(1, 2),
  });
}

const ROSTER_TABLE = 3;

describe("buildRosterReport page setup", () => {
  it("is A4 landscape", () => {
    const doc = buildRosterReport(report(), meta());
    expect(doc.pageSize).toBe("A4");
    expect(doc.pageOrientation).toBe("landscape");
  });

  it("leads with the three statistics sections and breaks the page before the roster", () => {
    const doc = buildRosterReport(report(), meta());
    expect(sectionNames(doc)).toEqual([
      "Funnel",
      "By course",
      "By course and year level",
      "Roster",
    ]);
    const breaks = doc.content.filter((node) => node.pageBreak === "after");
    expect(breaks).toHaveLength(1);
    expect(doc.content.indexOf(breaks[0])).toBeLessThan(
      doc.content.indexOf(tables(doc)[ROSTER_TABLE]),
    );
  });
});

describe("buildRosterReport statistics", () => {
  it("renders the funnel from the four buckets in funnel order", () => {
    const doc = buildRosterReport(report(), meta());
    const [funnel, byCourse, byLevel] = tables(doc);
    expect(headerOf(funnel)).toEqual([
      BUCKET_LABELS.NOT_STARTED,
      BUCKET_LABELS.IN_PROGRESS,
      BUCKET_LABELS.READY_FOR_QUEUE,
      BUCKET_LABELS.ENROLLED,
    ]);
    expect(rowOf(funnel, 0)).toEqual(["4", "2", "1", "3"]);
    expect(headerOf(byCourse)).toEqual(["Course", "Code", "Students"]);
    expect(headerOf(byLevel)).toEqual([
      "Course",
      "1st",
      "2nd",
      "3rd",
      "4th",
      "5th",
      "Total",
    ]);
    expect(YEAR_LEVELS).toHaveLength(5);
  });

  it("keeps the unassigned course last, named Unassigned, with a dash code", () => {
    const doc = buildRosterReport(report(), meta());
    const byCourse = tables(doc)[1];
    expect(rowOf(byCourse, 0)[0]).toBe("BS Information Technology");
    const unassigned = rowOf(byCourse, 1);
    expect(unassigned.slice(0, 2)).toEqual(["Unassigned", "-"]);
  });

  it("fills the year-level grid from the counts record", () => {
    const doc = buildRosterReport(report(), meta());
    expect(rowOf(tables(doc)[2], 0)).toEqual([
      "BS Information Technology",
      "5",
      "1",
      "1",
      "0",
      "0",
      "7",
    ]);
  });
});

describe("buildRosterReport roster table", () => {
  it("has exactly the thirteen documented headers", () => {
    const doc = buildRosterReport(report(), meta());
    const headers = headerOf(tables(doc)[ROSTER_TABLE]);
    expect(headers).toHaveLength(13);
    expect(headers).toEqual([
      "#",
      "Student No",
      "Student",
      "Course",
      "Yr",
      "Assessment",
      "Social Media",
      "Profiling",
      "Mugshot",
      "Consent",
      "Steps",
      "Queue",
      "Enrolled at",
    ]);
  });

  it("abbreviates the step states through SHORT_STATE_LABELS", () => {
    const doc = buildRosterReport(report(), meta());
    const row = rowOf(tables(doc)[ROSTER_TABLE], 0);
    expect(row.slice(5, 10)).toEqual([
      SHORT_STATE_LABELS.VERIFIED,
      SHORT_STATE_LABELS.VERIFIED,
      SHORT_STATE_LABELS.SUBMITTED,
      SHORT_STATE_LABELS.VERIFIED,
      SHORT_STATE_LABELS.PENDING,
    ]);
    // the long label is what the abbreviation stands for
    expect(row[7]).toBe("Review");
    expect(row).not.toContain(STEP_STATE_LABELS.SUBMITTED);
  });

  // Asserting `STEP_STATE_LABELS.SUBMITTED === "Pending review"` would be a
  // fact about another module: it passes whatever the builder does. What matters
  // is what the BUILDER prints for a SUBMITTED row.
  it("prints the abbreviation for a SUBMITTED row, never the domain's long label", () => {
    const doc = buildRosterReport(
      report({
        rows: [
          row({ stepStates: [stepState("PROFILING", "SUBMITTED")] }),
        ] as RosterReport["rows"],
      }),
      meta(),
    );
    const cells = rowOf(tables(doc)[ROSTER_TABLE], 0);
    expect(cells[7]).toBe("Review");
    expect(cells[7]).not.toBe(STEP_STATE_LABELS.SUBMITTED);
    expect(JSON.stringify(doc.content)).not.toContain(
      STEP_STATE_LABELS.SUBMITTED,
    );
  });

  it("reads the verified steps as n/total", () => {
    const doc = buildRosterReport(
      report({
        rows: [
          row({ stepsVerified: 4, stepsTotal: 6 }),
        ] as RosterReport["rows"],
      }),
      meta(),
    );
    expect(rowOf(tables(doc)[ROSTER_TABLE], 0)[10]).toBe("4/6");
  });

  it("maps the remaining columns", () => {
    const doc = buildRosterReport(
      report({
        rows: [
          row({
            yearLevel: "SECOND",
            queueStatus: "IN_PROGRESS",
            enrolledAt: "2026-03-04T06:32:00.000Z",
            studentNumber: null,
            departmentCode: null,
          }),
        ] as RosterReport["rows"],
      }),
      meta(),
    );
    const cells = rowOf(tables(doc)[ROSTER_TABLE], 0);
    expect(cells[0]).toBe("1");
    expect(cells[1]).toBe("-");
    expect(cells[2]).toBe("Dela Peña");
    expect(cells[3]).toBe("Unassigned");
    expect(cells[4]).toBe("2nd");
    expect(cells[11]).toBe("Serving");
    expect(cells[12]).toBe("04 Mar 2026");
  });

  it("numbers every row from one", () => {
    const doc = buildRosterReport(
      report({
        rows: [
          row(),
          row({ studentProfileId: "p2", studentName: "Bautista, Juan" }),
        ] as RosterReport["rows"],
      }),
      meta(),
    );
    const table = tables(doc)[ROSTER_TABLE];
    expect(bodyOf(table)).toHaveLength(3);
    expect(rowOf(table, 0)[0]).toBe("1");
    expect(rowOf(table, 1)[0]).toBe("2");
  });
});

describe("buildRosterReport foot lines", () => {
  it("counts the printed rows against the matched rows", () => {
    const doc = buildRosterReport(report(), meta());
    const last = doc.content.at(-1) as ContentNode;
    expect(last.text).toBe("1 of 10 students");
    expect(last.style).toBe("note");
  });

  it("carries no truncation note when the report is complete", () => {
    const doc = buildRosterReport(report(), meta({ truncated: false }));
    expect(JSON.stringify(doc.content)).not.toContain("narrow your filters");
  });

  it("carries the server's amber note only when truncated", () => {
    const doc = buildRosterReport(
      report({
        truncated: true,
        matchedCount: REPORT_ROW_CAP + 500,
        rows: new Array(REPORT_ROW_CAP)
          .fill(row())
          .flat() as RosterReport["rows"],
      }),
      meta(),
    );
    const note = doc.content.at(-1) as ContentNode;
    expect(note.style).toBe("warning");
    expect(note.text).toBe(
      `Showing ${REPORT_ROW_CAP.toLocaleString("en-US")} of 1,500 rows - narrow your filters.`,
    );
  });
});

describe("stateOf", () => {
  it("reads the per-step status out of stepStates, keyed by code", () => {
    const r = row() as unknown as Parameters<typeof stateOf>[0];
    expect(stateOf(r, "PROFILING")).toBe("SUBMITTED");
    expect(stateOf(r, "ENROLLMENT")).toBe("MISSING");
  });

  it("reads a step the row never carried as MISSING", () => {
    const r = row({ stepStates: [] }) as unknown as Parameters<
      typeof stateOf
    >[0];
    expect(stateOf(r, "ASSESSMENT")).toBe("MISSING");
  });
});

describe("WinAnsi safety", () => {
  it("emits no em dash anywhere in the document, furniture included", () => {
    const doc = buildRosterReport(report(), meta());
    expect(serialisable(doc)).not.toContain("\u2014");
  });

  it("folds a typographic student name rather than passing it through", () => {
    const doc = buildRosterReport(
      report({
        rows: [
          row({ studentName: "Niagara \u2014 Dela \u2019Pe\u00F1a" }),
        ] as RosterReport["rows"],
      }),
      meta(),
    );
    expect(rowOf(tables(doc)[ROSTER_TABLE], 0)[2]).toBe("Niagara - Dela 'Peña");
  });
});
