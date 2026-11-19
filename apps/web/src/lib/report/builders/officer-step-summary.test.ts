import { STEP_CODES } from "$lib/domain/constants";
import { describe, expect, it } from "vitest";
import type { ContentNode, ReportDocDefinition, ReportMeta } from "../types";
import {
  buildStepStatusSummary,
  type StepStatusSummary,
} from "./officer-step-summary";

/**
 * Never imports pdfmake and never inspects a PDF binary (spec 5.19).
 */

function meta(overrides: Partial<ReportMeta> = {}): ReportMeta {
  return {
    title: "Step Status Summary",
    generatedBy: "Juan Dela Cruz",
    generatedOn: "26 Sep 2026",
    yearLabel: "2025-2026",
    semester: "1st Sem",
    filterEcho: null,
    ...overrides,
  };
}

function overview(
  overrides: Partial<StepStatusSummary> = {},
): StepStatusSummary {
  return {
    steps: [
      {
        code: "ASSESSMENT",
        name: "Assessment",
        order: 1,
        unverified: 4,
        verified: 6,
      },
      {
        code: "SOCIAL_MEDIA",
        name: "Social Media",
        order: 2,
        unverified: 2,
        verified: 8,
      },
      {
        code: "PROFILING",
        name: "Profiling",
        order: 3,
        unverified: 0,
        verified: 10,
      },
      {
        code: "MUGSHOT",
        name: "Mugshot",
        order: 4,
        unverified: 0,
        verified: 10,
      },
      {
        code: "CONSENT",
        name: "Consent / Medical",
        order: 5,
        unverified: 1,
        verified: 9,
      },
    ],
    recentActivity: [
      {
        id: "v1",
        studentName: "Dela Peña",
        stepCode: "ASSESSMENT",
        stepName: "Assessment",
        action: "Verified",
        at: "2026-03-04T06:32:00.000Z",
      },
    ],
    hasActiveYear: true,
    yearLabel: "2025-2026 · 1st Sem",
    ...overrides,
  };
}

/**
 * The document's two tables. pdfmake keeps the rows under `table`, so that is
 * where a table is recognised -- a node with a top-level `body` is not one.
 */
type PdfTable = { body?: unknown[]; headerRows?: number };

type PdfTableNode = ContentNode & { table?: PdfTable };

function tables(doc: ReportDocDefinition): PdfTableNode[] {
  return doc.content.filter((node) =>
    Array.isArray((node as PdfTableNode).table?.body),
  ) as PdfTableNode[];
}

type Cell = { text?: string } | string;
type Row = Cell[];

/** `simpleTable` emits bare strings; the roster-style tables emit text nodes. */
function textOf(cell: Cell): string {
  return typeof cell === "string" ? cell : String(cell.text ?? "");
}

function cells(row: Row): string[] {
  return (row ?? []).map(textOf);
}

function bodyOf(table: PdfTableNode): Row[] {
  return (table.table?.body ?? []) as Row[];
}

function headerOf(table: PdfTableNode): string[] {
  return cells(bodyOf(table)[0]);
}

function rowOf(table: PdfTableNode, index: number): string[] {
  return cells(bodyOf(table)[index + 1]);
}

function serialisable(doc: ReportDocDefinition): string {
  return JSON.stringify({
    ...doc,
    header: doc.header(1, 2),
    footer: doc.footer(1, 2),
  });
}

describe("buildStepStatusSummary page setup", () => {
  it("is A4 portrait", () => {
    const doc = buildStepStatusSummary(overview(), meta());
    expect(doc.pageSize).toBe("A4");
    expect(doc.pageOrientation).toBe("portrait");
  });

  it("has the two sections in order", () => {
    const doc = buildStepStatusSummary(overview(), meta());
    expect(
      doc.content
        .filter((node) => node.style === "section")
        .map((node) => node.text),
    ).toEqual(["By step", "Recent activity"]);
  });
});

describe("by step", () => {
  it("has the five headers", () => {
    const doc = buildStepStatusSummary(overview(), meta());
    expect(headerOf(tables(doc)[0])).toEqual([
      "Step",
      "Unverified",
      "Verified",
      "Total",
      "% verified",
    ]);
  });

  it("walks STEP_CODES in order and totals unverified + verified", () => {
    const doc = buildStepStatusSummary(overview(), meta());
    const table = tables(doc)[0];
    expect(rowOf(table, 0)).toEqual(["Assessment", "4", "6", "10", "60%"]);
    expect(rowOf(table, 1)).toEqual(["Social Media", "2", "8", "10", "80%"]);
    expect(rowOf(table, 4)).toEqual([
      "Consent / Medical",
      "1",
      "9",
      "10",
      "90%",
    ]);
    const names = bodyOf(table)
      .slice(1)
      .map((row) => cells(row)[0]);
    expect(STEP_CODES.filter((code) => code !== "ENROLLMENT")).toHaveLength(
      names.length,
    );
  });

  it("reads 0% when the total is zero", () => {
    const doc = buildStepStatusSummary(
      overview({
        steps: [
          {
            code: "ASSESSMENT",
            name: "Assessment",
            order: 1,
            unverified: 0,
            verified: 0,
          },
        ],
      }),
      meta(),
    );
    expect(rowOf(tables(doc)[0], 0)).toEqual([
      "Assessment",
      "0",
      "0",
      "0",
      "0%",
    ]);
  });

  it("omits a step the overview does not report rather than printing a fake zero", () => {
    const doc = buildStepStatusSummary(overview(), meta());
    const table = tables(doc)[0];
    // the officer console tracks the five pre-enrollment steps only
    expect(bodyOf(table)).toHaveLength(1 + 5);
  });
});

describe("recent activity", () => {
  it("has the four headers and formats the instant in Asia/Manila", () => {
    const doc = buildStepStatusSummary(overview(), meta());
    const table = tables(doc)[1];
    expect(headerOf(table)).toEqual(["When", "Student", "Step", "Action"]);
    expect(rowOf(table, 0)).toEqual([
      "04 Mar 2026, 14:32",
      "Dela Peña",
      "Assessment",
      "Verified",
    ]);
  });

  it("renders an empty table when there is no activity", () => {
    const doc = buildStepStatusSummary(
      overview({ recentActivity: [] }),
      meta(),
    );
    const table = tables(doc)[1];
    expect(bodyOf(table)).toHaveLength(1);
  });
});

describe("filters", () => {
  it("emits no Filters: node even when the caller supplies a filter echo", () => {
    const doc = buildStepStatusSummary(
      overview(),
      meta({ filterEcho: "Status: Pending" }),
    );
    expect(serialisable(doc)).not.toContain("Filters:");
  });
});

describe("WinAnsi safety", () => {
  it("emits no em dash anywhere in the document", () => {
    expect(
      serialisable(buildStepStatusSummary(overview(), meta())),
    ).not.toContain("\u2014");
  });

  it("folds a typographic student name", () => {
    const doc = buildStepStatusSummary(
      overview({
        recentActivity: [
          {
            id: "v1",
            studentName: "Niagara \u2014 Dela \u2019Pe\u00F1a",
            stepCode: "MUGSHOT",
            stepName: "Mugshot",
            action: "Returned",
            at: "2026-03-04T06:32:00.000Z",
          },
        ],
      }),
      meta(),
    );
    expect(rowOf(tables(doc)[1], 0)[1]).toBe("Niagara - Dela 'Peña");
  });
});
