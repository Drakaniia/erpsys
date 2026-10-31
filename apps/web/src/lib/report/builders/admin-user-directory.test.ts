import { describe, expect, it } from "vitest";
import {
  buildUserDirectory,
  type UserDirectoryReport,
  type UserListItem,
} from "./admin-user-directory";
import type { ReportDocDefinition, ReportMeta } from "../types";

/**
 * Structural assertions on the plain-object docDefinition -- no pdfmake
 * import, no PDF binary (spec 5.19).
 */

function meta(overrides: Partial<ReportMeta> = {}): ReportMeta {
  return {
    title: "User Directory",
    generatedBy: "Juan Dela Cruz",
    generatedOn: "26 Sep 2026",
    yearLabel: "2025-2026",
    semester: "1st Sem",
    filterEcho: "Role: Instructor",
    matchedCount: 3,
    returnedCount: 3,
    truncated: false,
    ...overrides,
  };
}

function item(overrides: Partial<UserListItem> = {}): UserListItem {
  return {
    id: "u1",
    name: "Ana Reyes",
    email: "ana.reyes@cot.edu.ph",
    image: null,
    role: "STUDENT",
    isOutsideOrg: false,
    blocked: false,
    studentNumber: "2026-01455",
    studentProfileId: null,
    department: { id: "d1", name: "Computer Science", code: "CS" },
    yearLevel: "THIRD",
    joinedAt: "2026-01-15T02:10:00.000Z",
    ...overrides,
  };
}

function report(
  overrides: Partial<UserDirectoryReport> = {},
): UserDirectoryReport {
  return {
    year: { id: "ay1", label: "2025-2026", semesterLabel: "1st Sem" },
    rows: [item()],
    matchedCount: 1,
    truncated: false,
    ...overrides,
  };
}

/**
 * The pdfmake `table` object of the directory's single table (`content[0]`).
 * The rows are under `table`, and the repeated header row is `headerRows`, a
 * COUNT -- neither was true of the shape this test used to pin.
 */
type Table = {
  body?: unknown[][];
  headerRows?: number;
  dontBreakRows?: boolean;
};

function table(doc: ReportDocDefinition): Table {
  return (doc.content[0] as { table?: Table }).table ?? {};
}

function headerRow(doc: ReportDocDefinition): string[] {
  const body = table(doc).body ?? [];
  return (body[0] ?? []).map((cell) =>
    typeof cell === "string"
      ? cell
      : String((cell as { text?: string }).text ?? ""),
  );
}

function dataRows(doc: ReportDocDefinition): string[][] {
  return ((table(doc).body ?? []).slice(1) as unknown[][]).map((row) =>
    row.map((cell) =>
      typeof cell === "string"
        ? cell
        : String((cell as { text?: string }).text ?? ""),
    ),
  );
}

function row(doc: ReportDocDefinition, index: number): string[] {
  return dataRows(doc)[index];
}

/** The document minus its header/footer functions, serialised for text scans. */
function serialise(doc: ReportDocDefinition): string {
  return JSON.stringify({
    pageSize: doc.pageSize,
    pageOrientation: doc.pageOrientation,
    pageMargins: doc.pageMargins,
    info: doc.info,
    content: doc.content,
    header: doc.header(1, 1),
    footer: doc.footer(1, 1),
  });
}

/** The nodes after the table: the row-count line and the truncation note. */
function trailingNodes(
  doc: ReportDocDefinition,
): { text?: string; style?: string }[] {
  return doc.content.slice(1) as { text?: string; style?: string }[];
}

describe("page setup", () => {
  it("is A4 landscape", () => {
    const doc = buildUserDirectory(report(), meta());
    expect(doc.pageSize).toBe("A4");
    expect(doc.pageOrientation).toBe("landscape");
  });
});

describe("columns", () => {
  it("carries the ten documented headers, in order", () => {
    const doc = buildUserDirectory(report(), meta());
    expect(headerRow(doc)).toEqual([
      "#",
      "User",
      "Email",
      "Student No",
      "Role",
      "Org",
      "Course",
      "Year level",
      "Joined",
      "Status",
    ]);
  });

  it("adds the email and course columns the on-screen table does not show", () => {
    const headers = headerRow(buildUserDirectory(report(), meta()));
    expect(headers).toContain("Email");
    expect(headers).toContain("Course");
  });
});

describe("table layout", () => {
  it("repeats the header row and never breaks a row", () => {
    const t = table(buildUserDirectory(report(), meta()));
    expect(t.headerRows).toBe(1);
    expect(t.dontBreakRows).toBe(true);
  });
});

describe("row mapping", () => {
  it("numbers the rows from 1", () => {
    const doc = buildUserDirectory(
      report({ rows: [item(), item({ id: "u2" }), item({ id: "u3" })] }),
      meta(),
    );
    expect(dataRows(doc).map((r) => r[0])).toEqual(["1", "2", "3"]);
  });

  it("carries the name, email and student number", () => {
    const r = row(buildUserDirectory(report(), meta()), 0);
    expect(r[1]).toBe("Ana Reyes");
    expect(r[2]).toBe("ana.reyes@cot.edu.ph");
    expect(r[3]).toBe("2026-01455");
  });

  it("prints a dash for an absent student number", () => {
    const doc = buildUserDirectory(
      report({ rows: [item({ studentNumber: null })] }),
      meta(),
    );
    expect(row(doc, 0)[3]).toBe("-");
  });

  it("uses the human role labels", () => {
    const doc = buildUserDirectory(
      report({
        rows: [
          item({ role: "STUDENT" }),
          item({ role: "SBO_OFFICER" }),
          item({ role: "ENROLLMENT_ADVISER" }),
          item({ role: "ADMIN" }),
        ],
      }),
      meta(),
    );
    expect(dataRows(doc).map((r) => r[4])).toEqual([
      "Student",
      "SBO Officer",
      "Instructor",
      "Admin",
    ]);
  });

  it("maps the outside-org flag to Outside / Inside", () => {
    const doc = buildUserDirectory(
      report({
        rows: [item({ isOutsideOrg: true }), item({ isOutsideOrg: false })],
      }),
      meta(),
    );
    expect(dataRows(doc).map((r) => r[5])).toEqual(["Outside", "Inside"]);
  });

  it("carries the course, or a dash when the student has no placement", () => {
    const doc = buildUserDirectory(
      report({
        rows: [
          item({
            department: { id: "d1", name: "Computer Science", code: "CS" },
          }),
          item({ department: null }),
        ],
      }),
      meta(),
    );
    expect(dataRows(doc).map((r) => r[6])).toEqual(["Computer Science", "-"]);
  });

  it("shortens the year level", () => {
    const doc = buildUserDirectory(
      report({
        rows: [item({ yearLevel: "FIRST" }), item({ yearLevel: null })],
      }),
      meta(),
    );
    expect(dataRows(doc).map((r) => r[7])).toEqual(["1st", "-"]);
  });

  it("formats the joined date", () => {
    const doc = buildUserDirectory(
      report({ rows: [item({ joinedAt: "2026-01-15T02:10:00.000Z" })] }),
      meta(),
    );
    expect(row(doc, 0)[8]).toBe("15 Jan 2026");
  });

  it("maps the blocked flag to Blocked / Active", () => {
    const doc = buildUserDirectory(
      report({ rows: [item({ blocked: true }), item({ blocked: false })] }),
      meta(),
    );
    expect(dataRows(doc).map((r) => r[9])).toEqual(["Blocked", "Active"]);
  });

  it("folds names through toWinAnsi", () => {
    const doc = buildUserDirectory(
      report({ rows: [item({ name: "Ana \u2019Reyes\u2014Dela" })] }),
      meta(),
    );
    expect(row(doc, 0)[1]).toBe("Ana 'Reyes-Dela");
  });
});

describe("footer lines", () => {
  it("states how many of the matched rows are printed", () => {
    const doc = buildUserDirectory(
      report({ rows: [item(), item({ id: "u2" })], matchedCount: 3412 }),
      meta(),
    );
    expect(trailingNodes(doc)[0].text).toBe("2 of 3,412 rows");
    expect(trailingNodes(doc)[0].style).toBe("note");
  });

  it("carries no truncation note when the report is complete", () => {
    const doc = buildUserDirectory(report(), meta());
    const text = JSON.stringify(doc.content);
    expect(text).not.toContain("narrow your filters");
  });

  it("prints the amber truncation note only when truncated", () => {
    const doc = buildUserDirectory(
      report({ rows: [item()], matchedCount: 3412, truncated: true }),
      meta(),
    );
    const note = trailingNodes(doc).find((n) =>
      n.text?.includes("narrow your filters"),
    );
    expect(note?.text).toBe("Showing 1 of 3,412 rows - narrow your filters.");
    expect(note?.style).toBe("warning");
  });

  it("never renders an empty note, even when truncated reports a full set", () => {
    const doc = buildUserDirectory(
      report({ rows: [item()], matchedCount: 1, truncated: true }),
      meta(),
    );
    for (const node of trailingNodes(doc)) {
      expect((node.text ?? "").trim()).not.toBe("");
    }
  });
});

describe("empty results", () => {
  it("still emits the header row and an honest count line", () => {
    const doc = buildUserDirectory(
      report({ rows: [], matchedCount: 0 }),
      meta(),
    );
    expect(dataRows(doc)).toHaveLength(0);
    expect(headerRow(doc)).toHaveLength(10);
    expect(trailingNodes(doc)[0].text).toBe("0 of 0 rows");
  });
});

describe("year", () => {
  it("builds without a resolved academic year", () => {
    const doc = buildUserDirectory(report({ year: null }), meta());
    expect(doc.pageOrientation).toBe("landscape");
    expect(row(doc, 0)[6]).toBe("Computer Science");
  });
});

describe("text safety", () => {
  it("contains no em dash anywhere in the serialised document", () => {
    const doc = buildUserDirectory(
      report({
        rows: [
          item({ name: "Ana \u2014 Reyes", email: "a\u2014b@cot.edu.ph" }),
          item({
            id: "u2",
            studentNumber: null,
            department: null,
            yearLevel: null,
            blocked: true,
            isOutsideOrg: true,
          }),
        ],
        matchedCount: 3412,
        truncated: true,
      }),
      meta(),
    );
    expect(serialise(doc)).not.toContain("\u2014");
  });
});
