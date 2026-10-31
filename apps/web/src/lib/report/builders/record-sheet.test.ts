// ponytail: test suite >400 lines; split deferred - shared setup/mocks make scenario boundaries unclear without a module-level refactor; leave intact.
import { describe, expect, it } from "vitest";
import { STEP_CODES, stepLabel } from "$lib/domain/constants";
import type { StudentRecordStep } from "$lib/domain/types";
import type { ContentNode, ReportDocDefinition, ReportMeta } from "../types";
import { buildRecordSheet, type StudentRecord } from "./record-sheet";

/**
 * No pdfmake import anywhere in this file: the builder returns a plain object
 * and that object is what is asserted (spec 5.19). The em dash check is the
 * direct acceptance test -- U+2014 is not in the WinAnsi repertoire the
 * standard PDF fonts are limited to (spec 5.7 / 7.1), so a single one reaching
 * a cell is a visible `?` on a printed record.
 */

const EM_DASH = "\u2014";

function meta(overrides: Partial<ReportMeta> = {}): ReportMeta {
  return {
    title: "Student Verification Record",
    generatedBy: "Juan Dela Cruz",
    generatedOn: "26 Sep 2026",
    yearLabel: "2025-2026",
    semester: "1st Sem",
    filterEcho: null,
    ...overrides,
  };
}

function step(overrides: Partial<StudentRecordStep> = {}): StudentRecordStep {
  return {
    code: "ASSESSMENT",
    status: "MISSING",
    submittedAt: null,
    verifiedAt: null,
    verifiedByName: null,
    respondedAt: null,
    respondedByName: null,
    evidenceCount: 0,
    replyChips: [],
    replyNote: null,
    ...overrides,
  };
}

function record(overrides: Partial<StudentRecord> = {}): StudentRecord {
  return {
    student: {
      name: "Juan Dela Cruz",
      email: "22001234@student.buksu.edu.ph",
      studentNumber: "22001234",
      isOutsideOrg: false,
      createdAt: "2026-08-01T02:00:00.000Z",
    },
    year: { id: "ay1", label: "2025-2026", semesterLabel: "1st Sem" },
    enrollment: {
      departmentName: "Information Technology",
      departmentCode: "BSIT",
      yearLevel: "SECOND",
      enrolledAt: null,
    },
    enrolledAt: null,
    steps: STEP_CODES.map((code) => step({ code })),
    queue: null,
    ...overrides,
  };
}

function build(records: StudentRecord[]): ReportDocDefinition {
  return buildRecordSheet(records, meta());
}

function textsOf(nodes: ContentNode[]): string[] {
  return nodes.map((node) => String(node.text ?? ""));
}

function sectionTitles(doc: ReportDocDefinition): string[] {
  return doc.content
    .filter((node) => node.style === "section")
    .map((node) => String(node.text));
}

/**
 * A pdfmake table as this file reads it. The rows live under `table` -- a node
 * with a top-level `body` is not a table to pdfmake at all, which is why the
 * helpers below reach through `tableOf` rather than reading `node.body`.
 */
type PdfTable = {
  headerRows?: number;
  dontBreakRows?: boolean;
  widths?: (string | number)[];
  body?: unknown[];
};

function tableOf(node: ContentNode): PdfTable {
  return (node.table ?? {}) as PdfTable;
}

/** The repeated-header tables, one per student. */
function stepTables(doc: ReportDocDefinition): ContentNode[] {
  return doc.content.filter((node) => tableOf(node).headerRows === 1);
}

/** Cells of one table row, as plain strings. */
function rowTexts(row: unknown): string[] {
  return (row as ContentNode[]).map((cell) => String(cell.text ?? ""));
}

/**
 * The label/value grids, keyed by the section heading that precedes them. A
 * grid row is two cells; a step-table row is nine, which is what tells the two
 * apart without depending on node identity.
 */
function gridsBySection(
  doc: ReportDocDefinition,
): Record<string, Record<string, string>> {
  const out: Record<string, Record<string, string>> = {};
  let current = "";
  for (const node of doc.content) {
    if (node.style === "section") {
      current = String(node.text);
      continue;
    }
    const body = tableOf(node).body as [ContentNode, ContentNode][] | undefined;
    if (
      !body ||
      body.length === 0 ||
      !Array.isArray(body[0]) ||
      body[0].length !== 2
    )
      continue;
    const pairs: Record<string, string> = {};
    for (const row of body) pairs[String(row[0].text)] = String(row[1].text);
    out[current] = pairs;
  }
  return out;
}

describe("page setup", () => {
  it("is a portrait A4 document", () => {
    const doc = build([record()]);
    expect(doc.pageSize).toBe("A4");
    expect(doc.pageOrientation).toBe("portrait");
  });
});

describe("sections", () => {
  it("renders the four sections in the documented order", () => {
    expect(sectionTitles(build([record()]))).toEqual([
      "Student",
      "Academic year & enrollment",
      "Verification steps",
      "Queue & enrollment",
    ]);
  });

  it("carries the full name and the academic year above the sections", () => {
    const doc = build([record()]);
    const heading = doc.content.find((node) => node.fontSize === 14);
    expect(heading?.text).toBe("Juan Dela Cruz");
    expect(textsOf(doc.content)).toContain("AY 2025-2026 - 1st Sem");
  });

  it("describes the student in section one", () => {
    const grids = gridsBySection(build([record()]));
    expect(grids.Student).toEqual({
      "Full name": "Juan Dela Cruz",
      "Student number": "22001234",
      Email: "22001234@student.buksu.edu.ph",
      Course: "Information Technology (BSIT)",
      "Year level": "2nd Year",
      "Outside organisation": "No",
      "Account created": "01 Aug 2026",
    });
  });

  it("repeats course and year level in section two", () => {
    const grids = gridsBySection(build([record()]));
    expect(grids["Academic year & enrollment"]).toEqual({
      "Academic year": "AY 2025-2026 - 1st Sem",
      Enrolled: "Yes",
      Course: "Information Technology (BSIT)",
      "Year level": "2nd Year",
    });
  });

  it("says Yes in section two once either enrollment signal is set", () => {
    const withEnrollment = build([
      record({ enrolledAt: "2026-09-10T06:00:00.000Z" }),
    ]);
    expect(
      gridsBySection(withEnrollment)["Academic year & enrollment"].Enrolled,
    ).toBe("Yes");

    // `enrolledAt` is populated from the queue or the ENROLLMENT step even
    // when no enrollment document exists, so the two signals are OR'd.
    const dateOnly = build([
      record({
        enrollment: null,
        enrolledAt: "2026-09-10T06:00:00.000Z",
      }),
    ]);
    expect(
      gridsBySection(dateOnly)["Academic year & enrollment"].Enrolled,
    ).toBe("Yes");
  });

  it("reads Not enrolled rather than omitting the enrollment values", () => {
    const grids = gridsBySection(
      build([record({ enrollment: null, enrolledAt: null })]),
    );
    expect(grids["Academic year & enrollment"]).toEqual({
      "Academic year": "AY 2025-2026 - 1st Sem",
      Enrolled: "No",
      Course: "Not enrolled",
      "Year level": "Not enrolled",
    });
    expect(grids.Student.Course).toBe("Not enrolled");
    expect(grids.Student["Year level"]).toBe("-");
  });
});

describe("verification steps table", () => {
  it("has exactly the nine documented headers, in order", () => {
    const [table] = stepTables(build([record()]));
    const header = rowTexts((tableOf(table).body as unknown[])[0]);
    expect(header).toEqual([
      "Step",
      "Status",
      "Submitted",
      "Verified",
      "Verified by",
      "Returned",
      "Returned by",
      "Evidence files",
      "Officer reply",
    ]);
  });

  it("repeats the header row and never splits a row", () => {
    const [table] = stepTables(build([record()]));
    // `headerRows` is a COUNT -- pdfmake repeats that many rows on every
    // continuation page; the boolean `headerRow` the sketch used repeats none.
    expect(tableOf(table).headerRows).toBe(1);
    expect(tableOf(table).dontBreakRows).toBe(true);
    // nine columns, one per STEP_HEADERS entry
    expect(tableOf(table).widths).toHaveLength(9);
  });

  it("carries one row per STEP_CODES entry, in STEP_CODES order", () => {
    const [table] = stepTables(build([record()]));
    const body = tableOf(table).body as unknown[];
    // header + every step, MISSING included: the section is never filtered
    expect(body).toHaveLength(STEP_CODES.length + 1);
    expect(body.slice(1).map((row) => rowTexts(row)[0])).toEqual(
      STEP_CODES.map(stepLabel),
    );
  });

  it("maps a verified step to labels, dates, names, a count and a reply", () => {
    const steps = STEP_CODES.map((code) =>
      step({
        code,
        status: "VERIFIED",
        submittedAt: "2026-09-01T03:20:00.000Z",
        verifiedAt: "2026-09-02T06:05:00.000Z",
        verifiedByName: "Ana Reyes",
        evidenceCount: 2,
        replyChips: ["Photo not clear", "Wrong angle"],
        replyNote: "Please retake it",
      }),
    );
    const [table] = stepTables(build([record({ steps })]));
    const first = rowTexts((tableOf(table).body as unknown[])[1]);
    expect(first[0]).toBe("Assessment");
    expect(first[1]).toBe("Verified");
    expect(first[2]).toBe("01 Sep 2026, 11:20");
    expect(first[3]).toBe("02 Sep 2026, 14:05");
    expect(first[4]).toBe("Ana Reyes");
    expect(first[7]).toBe("2");
    expect(first[8]).toBe("Photo not clear; Wrong angle; Please retake it");
  });

  it("reuses the screen's step-state labels", () => {
    const steps = STEP_CODES.map((code, index) =>
      step({
        code,
        status: (
          [
            "MISSING",
            "PENDING",
            "SUBMITTED",
            "VERIFIED",
            "RETURNED",
            "PENDING",
          ] as const
        )[index],
      }),
    );
    const [table] = stepTables(build([record({ steps })]));
    const statuses = (tableOf(table).body as unknown[])
      .slice(1)
      .map((row) => rowTexts(row)[1]);
    expect(statuses).toEqual([
      "Missing",
      "Pending",
      "Pending review",
      "Verified",
      "Returned",
      "Pending",
    ]);
  });

  it("falls back to a dash when a step has no reply at all", () => {
    const [table] = stepTables(build([record()]));
    const first = rowTexts((tableOf(table).body as unknown[])[1]);
    expect(first[8]).toBe("-");
    expect(first[2]).toBe("-");
    expect(first[3]).toBe("-");
    expect(first[7]).toBe("0");
  });
});

describe("queue & enrollment grid", () => {
  it("reads Not in queue when the student never queued", () => {
    const grids = gridsBySection(build([record()]));
    expect(grids["Queue & enrollment"]).toEqual({
      "Queue status": "Not in queue",
      "Joined at": "-",
      "Serving started": "-",
      "Completed at": "-",
      "Served by": "-",
      "Enrolled at": "-",
    });
  });

  it("labels the queue status and fills the served-at columns", () => {
    const grids = gridsBySection(
      build([
        record({
          queue: {
            status: "IN_PROGRESS",
            joinedAt: "2026-09-20T02:00:00.000Z",
            servedAt: "2026-09-20T03:00:00.000Z",
            completedAt: null,
            servedByName: "Ana Reyes",
          },
          enrolledAt: "2026-09-10T06:00:00.000Z",
        }),
      ]),
    );
    expect(grids["Queue & enrollment"]).toEqual({
      "Queue status": "Serving",
      "Joined at": "20 Sep 2026, 10:00",
      "Serving started": "20 Sep 2026, 11:00",
      "Completed at": "-",
      "Served by": "Ana Reyes",
      "Enrolled at": "10 Sep 2026, 14:00",
    });
  });
});

describe("page breaks", () => {
  /** Every break node, whichever direction it breaks. */
  function breaks(doc: ReportDocDefinition): ContentNode[] {
    return doc.content.filter((node) => node.pageBreak !== undefined);
  }

  it("puts a pageBreak before each record after the first", () => {
    const doc = build([
      record(),
      record({ student: { ...record().student, name: "Ana Reyes" } }),
    ]);
    // One break separates two records -- never one after each, which would
    // leave pdfmake a blank final page.
    expect(
      doc.content.filter((node) => node.pageBreak === "before"),
    ).toHaveLength(1);
    expect(
      doc.content.filter((node) => node.pageBreak === "after"),
    ).toHaveLength(0);
    expect(breaks(doc)).toHaveLength(1);
    // two blocks: the 14pt name heading is the top of each
    expect(doc.content.filter((node) => node.fontSize === 14)).toHaveLength(2);
    expect(stepTables(doc)).toHaveLength(2);
    expect(sectionTitles(doc)).toHaveLength(8);
  });

  it("breaks once per record after the first, for any batch size", () => {
    for (const n of [1, 2, 3, 5]) {
      const records = Array.from({ length: n }, (_, index) =>
        record({
          student: { ...record().student, name: `Student ${index + 1}` },
        }),
      );
      const doc = build(records);
      expect(breaks(doc)).toHaveLength(n - 1);
      expect(doc.content.filter((node) => node.fontSize === 14)).toHaveLength(
        n,
      );
      expect(stepTables(doc)).toHaveLength(n);
      expect(sectionTitles(doc)).toHaveLength(4 * n);
    }
  });

  it("adds no page break to a single-student export", () => {
    const doc = build([record()]);
    expect(doc.content.some((node) => node.pageBreak !== undefined)).toBe(
      false,
    );
    expect(sectionTitles(doc)).toHaveLength(4);
  });
});

describe("text safety", () => {
  it("folds a curly apostrophe in a name to WinAnsi-safe ASCII", () => {
    const doc = build([
      record({
        student: { ...record().student, name: "Ma\u2019ry Joy Dizon" },
      }),
    ]);
    const heading = doc.content.find((node) => node.fontSize === 14);
    expect(heading?.text).toBe("Ma'ry Joy Dizon");
    expect(gridsBySection(doc).Student["Full name"]).toBe("Ma'ry Joy Dizon");
  });

  it("folds typographic punctuation in a reply note through toWinAnsi", () => {
    const steps = [
      step({
        code: "MUGSHOT",
        replyNote: "Too dark \u2014 retake it\u2026 please",
      }),
    ];
    const [table] = stepTables(build([record({ steps })]));
    // MUGSHOT is the fourth `STEP_CODES` entry, so the fourth body row.
    const mugshot = rowTexts(
      (tableOf(table).body as unknown[])[1 + STEP_CODES.indexOf("MUGSHOT")],
    );
    expect(mugshot[0]).toBe("Mugshot");
    expect(mugshot[8]).toBe("Too dark - retake it... please");
  });

  it("renders every absent value as a hyphen, never an em dash", () => {
    const doc = build([record()]);
    const serialised = JSON.stringify(doc);
    expect(serialised).not.toContain(EM_DASH);
    // the absent values really are present, as "-"
    expect(gridsBySection(doc)["Queue & enrollment"]["Joined at"]).toBe("-");
  });

  it("leaves no em dash in a serialised two-student batch", () => {
    const doc = build([
      record({
        student: { ...record().student, name: "Juan \u2014Dela Cruz" },
        steps: [step({ replyNote: "Wrong \u2014 try again" })],
      }),
      record({
        enrollment: null,
        queue: {
          status: "WAITING",
          joinedAt: "",
          servedAt: null,
          completedAt: null,
          servedByName: null,
        },
      }),
    ]);
    expect(JSON.stringify(doc)).not.toContain(EM_DASH);
  });
});

describe("authenticity note", () => {
  function withNote(note: string | null): ReportDocDefinition {
    return buildRecordSheet([record()], meta({ authenticityNote: note }));
  }

  it("renders the note as the last content node when supplied", () => {
    const doc = withNote("Generated from ERPSYS; verify with the SBO office.");
    const last = doc.content[doc.content.length - 1];
    expect(last.text).toBe(
      "Generated from ERPSYS; verify with the SBO office.",
    );
  });

  it("folds the note through toWinAnsi", () => {
    const doc = withNote("Generated \u2014 verify with SBO\u2026");
    const last = doc.content[doc.content.length - 1];
    expect(last.text).toBe("Generated - verify with SBO...");
  });

  it("adds nothing when there is no note, so console output is unchanged", () => {
    const plain = withNote(null);
    const original = buildRecordSheet([record()], meta());
    expect(plain.content).toEqual(original.content);
    expect(plain.content.some((node) => node.color === "#888")).toBe(false);
  });
});
