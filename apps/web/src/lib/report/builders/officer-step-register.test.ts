import { describe, expect, it } from "vitest";
import { REPORT_ROW_CAP } from "$lib/domain/report";
import type { ContentNode, ReportMeta } from "../types";
import {
  buildStepRegister,
  type StepRegisterReport,
  type StepRegisterRow,
} from "./officer-step-register";

/**
 * No pdfmake import anywhere in this file: the builder returns a plain object
 * and that object is what is asserted (spec 5.19).
 */

const EM_DASH = "\u2014";

/** The same locale-grouped rendering the builder uses, so the cap is not restated. */
const COUNT = new Intl.NumberFormat("en-PH");

const HEADERS = [
  "#",
  "Student No",
  "Student",
  "Status",
  "Submitted",
  "Verified",
  "Evidence",
  "Replied",
];

function meta(overrides: Partial<ReportMeta> = {}): ReportMeta {
  return {
    title: "Step Verification Register",
    generatedBy: "Juan Dela Cruz",
    generatedOn: "26 Sep 2026",
    yearLabel: "2025-2026",
    semester: "1st Sem",
    filterEcho: null,
    ...overrides,
  };
}

function row(overrides: Partial<StepRegisterRow> = {}): StepRegisterRow {
  return {
    student: {
      studentProfileId: "profile-1",
      name: "Ana Reyes",
      studentNumber: "22001234",
    },
    status: "PENDING",
    submittedAt: "2026-09-20T03:20:00.000Z",
    verifiedAt: null,
    verifiedByName: null,
    evidenceCount: 0,
    hasReply: false,
    ...overrides,
  };
}

function report(
  overrides: Partial<StepRegisterReport> = {},
): StepRegisterReport {
  return {
    year: { id: "ay1", label: "2025-2026", semesterLabel: "1st Sem" },
    step: { code: "SOCIAL_MEDIA", name: "Social Media" },
    rows: [row()],
    matchedCount: 1,
    truncated: false,
    ...overrides,
  };
}

function build(data: StepRegisterReport) {
  return buildStepRegister(data, meta());
}

/**
 * The register's table, reached through pdfmake's `table` wrapper: the rows are
 * under `table`, and `headerRows` is a COUNT of rows to repeat, not a boolean.
 */
type PdfTable = {
  headerRows?: number;
  dontBreakRows?: boolean;
  body?: unknown[];
};

function tableOf(doc: { content: ContentNode[] }): ContentNode {
  const node = doc.content.find(
    (candidate) => (candidate.table as PdfTable | undefined)?.headerRows === 1,
  );
  if (!node) throw new Error("no table in the document");
  return node;
}

function pdfTableOf(doc: { content: ContentNode[] }): PdfTable {
  return tableOf(doc).table as PdfTable;
}

function rowTexts(row: unknown): string[] {
  return (row as ContentNode[]).map((cell) => String(cell.text ?? ""));
}

function bodyOf(doc: { content: ContentNode[] }): unknown[] {
  return pdfTableOf(doc).body as unknown[];
}

function textsOf(doc: { content: ContentNode[] }): string[] {
  return doc.content.map((node) => String(node.text ?? ""));
}

describe("page setup", () => {
  it("is a landscape A4 document", () => {
    const doc = build(report());
    expect(doc.pageSize).toBe("A4");
    expect(doc.pageOrientation).toBe("landscape");
  });
});

describe("lead line", () => {
  it("names the step and the submission count", () => {
    const doc = build(report({ matchedCount: 3, rows: [row()] }));
    expect(textsOf(doc)[0]).toBe("Step: Social Media   |   3 submission(s)");
  });

  it("uses the domain label, not the raw code", () => {
    const doc = build(
      report({ step: { code: "CONSENT", name: "Consent / Medical" } }),
    );
    expect(textsOf(doc)[0]).toContain("Consent / Medical");
  });
});

describe("columns", () => {
  it("has exactly the eight documented headers, in order", () => {
    expect(rowTexts(bodyOf(build(report()))[0])).toEqual(HEADERS);
  });

  it("repeats the header row and never splits a row", () => {
    const table = pdfTableOf(build(report()));
    expect(table.headerRows).toBe(1);
    expect(table.dontBreakRows).toBe(true);
  });

  it("gives every row eight cells", () => {
    for (const cells of bodyOf(build(report({ rows: [row(), row()] }))).slice(
      1,
    )) {
      expect(rowTexts(cells)).toHaveLength(8);
    }
  });

  it("numbers the rows from one", () => {
    const body = bodyOf(
      build(report({ rows: [row(), row({})], matchedCount: 2 })),
    );
    expect(body.slice(1).map((r) => rowTexts(r)[0])).toEqual(["1", "2"]);
  });
});

describe("row mapping", () => {
  it("maps student number, status, both timestamps and the evidence count", () => {
    const body = bodyOf(
      build(
        report({
          rows: [
            row({
              status: "VERIFIED",
              verifiedAt: "2026-09-21T06:05:00.000Z",
              evidenceCount: 3,
            }),
          ],
        }),
      ),
    );
    expect(rowTexts(body[1])).toEqual([
      "1",
      "22001234",
      "Ana Reyes",
      "Verified",
      "20 Sep 2026, 11:20",
      "21 Sep 2026, 14:05",
      "3",
      "-",
    ]);
  });

  /**
   * A register a registrar reads must never show the raw enum, and the labels
   * are `STEP_STATE_LABELS` -- the same map the officer console's status chips
   * and the instructor roster use (spec 6.3).
   */
  it("prints the human step-state label, never the raw enum", () => {
    const body = bodyOf(
      build(
        report({
          rows: [
            row({ status: "PENDING" }),
            row({ status: "SUBMITTED" }),
            row({ status: "VERIFIED" }),
            row({ status: "RETURNED" }),
          ],
          matchedCount: 4,
        }),
      ),
    );
    expect(body.slice(1).map((cells) => rowTexts(cells)[3])).toEqual([
      "Pending",
      "Pending review",
      "Verified",
      "Returned",
    ]);
  });

  it("leaves no status column showing a raw server enum", () => {
    const body = bodyOf(
      build(
        report({
          rows: [
            row({ status: "PENDING" }),
            row({ status: "SUBMITTED" }),
            row({ status: "VERIFIED" }),
            row({ status: "RETURNED" }),
          ],
          matchedCount: 4,
        }),
      ),
    );
    for (const cells of body.slice(1)) {
      expect(rowTexts(cells)[3]).not.toMatch(/^[A-Z_]+$/);
    }
  });

  it("renders the evidence column as a count, never an image or a URL", () => {
    const body = bodyOf(build(report({ rows: [row({ evidenceCount: 2 })] })));
    const evidence = rowTexts(body[1])[6];
    expect(evidence).toBe("2");
    expect(evidence).not.toMatch(/https?:|uploadthing|image/i);
  });

  it("reads Replied as Yes or a dash", () => {
    const body = bodyOf(
      build(
        report({
          rows: [row({ hasReply: true }), row({ hasReply: false })],
          matchedCount: 2,
        }),
      ),
    );
    expect(rowTexts(body[1])[7]).toBe("Yes");
    expect(rowTexts(body[2])[7]).toBe("-");
  });

  it("dashes an absent student number", () => {
    const body = bodyOf(
      build(
        report({
          rows: [
            row({
              student: {
                studentProfileId: "p",
                name: "Ana Reyes",
                studentNumber: null,
              },
            }),
          ],
        }),
      ),
    );
    expect(rowTexts(body[1])[1]).toBe("-");
  });

  it("folds a curly apostrophe in a name to WinAnsi-safe ASCII", () => {
    const body = bodyOf(
      build(
        report({
          rows: [
            row({
              student: {
                studentProfileId: "p",
                name: "Ma\u2019ry Joy Dizon",
                studentNumber: null,
              },
            }),
          ],
        }),
      ),
    );
    expect(rowTexts(body[1])[2]).toBe("Ma'ry Joy Dizon");
  });
});

describe("footer line", () => {
  it("reads <returned> of <matched> rows", () => {
    expect(textsOf(build(report()))).toContain("1 of 1 rows");
    expect(
      textsOf(build(report({ rows: [row(), row()], matchedCount: 2 }))),
    ).toContain("2 of 2 rows");
  });

  it("groups the counts", () => {
    const doc = build(
      report({ rows: [row()], matchedCount: 3412, truncated: true }),
    );
    expect(textsOf(doc)).toContain("1 of 3,412 rows");
  });
});

describe("truncation note", () => {
  it("is absent when the report is complete", () => {
    const doc = build(
      report({ rows: [row()], matchedCount: 1, truncated: false }),
    );
    expect(textsOf(doc).some((t) => t.includes("narrow your filters"))).toBe(
      false,
    );
    expect(doc.content.some((node) => node.style === "warning")).toBe(false);
  });

  it("is the server's sentence when the cap bit", () => {
    const doc = build(
      report({ rows: [row()], matchedCount: 3412, truncated: true }),
    );
    expect(textsOf(doc)).toContain(
      "Showing 1 of 3,412 rows - narrow your filters.",
    );
    const note = doc.content.find((node) => node.style === "warning");
    expect(note?.text).toBe("Showing 1 of 3,412 rows - narrow your filters.");
  });

  it("never renders an empty note", () => {
    // `truncated` set but the cap did not bite: the server's sentence is empty,
    // so no node is created at all.
    const doc = build(
      report({ rows: [row()], matchedCount: 1, truncated: true }),
    );
    expect(doc.content.some((node) => node.style === "warning")).toBe(false);
  });

  it("matches the cap boundary exactly", () => {
    const doc = build(
      report({
        rows: new Array(REPORT_ROW_CAP).fill(row()),
        matchedCount: REPORT_ROW_CAP,
        truncated: true,
      }),
    );
    const cap = COUNT.format(REPORT_ROW_CAP);
    expect(textsOf(doc)).toContain(`${cap} of ${cap} rows`);
    expect(doc.content.some((node) => node.style === "warning")).toBe(false);
  });
});

describe("text safety", () => {
  it("leaves no em dash in the serialised document", () => {
    const doc = build(
      report({
        rows: [
          row({
            student: {
              studentProfileId: "p",
              name: "Juan \u2014Dela Cruz",
              studentNumber: null,
            },
          }),
        ],
        matchedCount: 3412,
        truncated: true,
      }),
    );
    expect(JSON.stringify(doc)).not.toContain(EM_DASH);
  });
});
