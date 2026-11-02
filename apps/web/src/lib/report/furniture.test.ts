// ponytail: test suite >400 lines; split deferred - shared setup/mocks make scenario boundaries unclear without a module-level refactor; leave intact.
import { describe, expect, it } from "vitest";
import { REPORT_ROW_CAP } from "$lib/domain/report";
import {
  LOGO_KEY,
  keyValueGrid,
  pageFurniture,
  simpleTable,
} from "./furniture";
import { ORG_NAME } from "./format";
import type { ContentNode, ReportMeta } from "./types";

/**
 * These tests never import pdfmake and never inspect a PDF binary (spec 5.19).
 * `header` and `footer` are functions of `(currentPage, pageCount)`, so they are
 * CALLED here and the returned node is inspected structurally.
 */

function meta(overrides: Partial<ReportMeta> = {}): ReportMeta {
  return {
    title: "Step Verification Register",
    generatedBy: "Juan Dela Cruz",
    generatedOn: "26 Sep 2026",
    yearLabel: "2025-2026",
    semester: "1st Sem",
    filterEcho: null,
    matchedCount: 12,
    returnedCount: 12,
    truncated: false,
    ...overrides,
  };
}

type Column = {
  text?: string;
  alignment?: string;
  image?: string;
  stack?: ContentNode[];
};

type CanvasLine = {
  type: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  lineWidth: number;
};

/** The header's two nodes: the logo/title row, then the rule beneath it. */
function headerNodes(doc: ReturnType<typeof pageFurniture>): ContentNode[] {
  return doc.header(1, 1).stack as ContentNode[];
}

function headerColumns(doc: ReturnType<typeof pageFurniture>): Column[] {
  return (headerNodes(doc)[0].columns as Column[]) ?? [];
}

/** The text stack beside the logo -- org name, title, generated-by, filters. */
function headerStack(doc: ReturnType<typeof pageFurniture>): ContentNode[] {
  return headerColumns(doc)[1].stack as ContentNode[];
}

function ruleOf(doc: ReturnType<typeof pageFurniture>): CanvasLine {
  return (headerNodes(doc)[1].canvas as CanvasLine[])[0];
}

function footerColumns(doc: ReturnType<typeof pageFurniture>): Column[] {
  return (doc.footer(1, 1).columns as Column[]) ?? [];
}

function textOf(nodes: ContentNode[]): string[] {
  return nodes.map((node) => String(node.text ?? ""));
}

describe("LOGO_KEY", () => {
  it("is the vfs key the header references", () => {
    expect(LOGO_KEY).toBe("cotSboLogo");
  });

  it("is the image the header asks pdfmake for", () => {
    const logo = headerColumns(pageFurniture(meta(), "portrait"))[0];
    expect(logo.image).toBe(LOGO_KEY);
  });
});

describe("pageFurniture page setup", () => {
  it("is A4 in the requested orientation", () => {
    expect(pageFurniture(meta(), "portrait").pageSize).toBe("A4");
    expect(pageFurniture(meta(), "portrait").pageOrientation).toBe("portrait");
    expect(pageFurniture(meta(), "landscape").pageOrientation).toBe(
      "landscape",
    );
  });

  it("gives portrait and landscape different margins", () => {
    const portrait = pageFurniture(meta(), "portrait").pageMargins;
    const landscape = pageFurniture(meta(), "landscape").pageMargins;
    expect(portrait).not.toEqual(landscape);
  });

  /**
   * pdfmake reads a 4-element `pageMargins` array as
   * `[left, top, right, bottom]` (`PageSize.normalizePageMargin`) -- NOT the
   * CSS order. Read as top/right/bottom/left, the old tuple `[34, 40, 36, 40]`
   * transposed every value: the sheet got a 34pt left margin and a 40pt one on
   * top, and the header band was sized against a number that was never the
   * height. These assertions are the whole tuple on purpose -- an index-based
   * assertion cannot catch a transposition.
   */
  it("orders the margin tuple as pdfmake reads it: left, top, right, bottom", () => {
    expect(pageFurniture(meta(), "portrait").pageMargins).toEqual([
      40, 72, 40, 36,
    ]);
    expect(pageFurniture(meta(), "landscape").pageMargins).toEqual([
      32, 72, 32, 34,
    ]);
  });

  it("leaves the body a symmetric text column", () => {
    for (const orientation of ["portrait", "landscape"] as const) {
      const [left, , right] = pageFurniture(meta(), orientation).pageMargins;
      expect(left).toBe(right);
    }
  });

  /**
   * The header band is not a margin a report may spend: pdfmake measures the
   * header into an unbreakable block of `height: pageMargins.top` and keeps
   * only the first page of that block, so header content taller than the band
   * is discarded outright rather than overlapped onto the body. The header is
   * 39.4pt tall unfiltered and 49.8pt with the `Filters:` line, which is why
   * the band is 72 -- 56 of room for the header plus 16 of top padding -- and
   * not the 40 the tuple used to carry in slot 1.
   */
  it("reserves a top band tall enough for the header's tallest form and its padding", () => {
    for (const orientation of ["portrait", "landscape"] as const) {
      const [, top] = pageFurniture(meta(), orientation).pageMargins;
      const [, padTop] = pageFurniture(meta(), orientation).header(1, 1)
        .margin as [number, number, number, number];
      // 49.8pt of header (four stack lines + rule + the block's own bottom
      // margin) plus slack, so no report can outgrow the band by a point of
      // leading and lose its rule -- and the header's own top padding is
      // spent inside that same box, so it has to be counted too.
      expect(top).toBeGreaterThanOrEqual(56 + padTop);
    }
  });

  /**
   * `pageMargins` reads like a page-wide frame, but pdfmake applies only its
   * left and right values to BODY content: a header and a footer are measured
   * into a block of `{ x: 0, width: pageWidth }`, so their coordinate zero is
   * the paper edge. Left un-inset they printed hard against both edges of the
   * sheet, outboard of every table.
   */
  it("insets the header and the footer to the body's own left and right margins", () => {
    for (const orientation of ["portrait", "landscape"] as const) {
      const [left, , right] = pageFurniture(meta(), orientation).pageMargins;

      // node margins are [left, top, right, bottom]. The header's top is
      // non-zero: a header is measured from the PAPER EDGE, so 0 there
      // printed the org name hard against the top trim.
      expect(pageFurniture(meta(), orientation).header(1, 1).margin).toEqual([
        left,
        expect.any(Number),
        right,
        6,
      ]);
      expect(pageFurniture(meta(), orientation).footer(1, 1).margin).toEqual([
        left,
        6,
        right,
        0,
      ]);
    }
  });

  it("insets the header and the footer identically, so they share one column", () => {
    const doc = pageFurniture(meta(), "portrait");
    const header = doc.header(1, 1).margin as number[];
    const footer = doc.footer(1, 1).margin as number[];
    expect(header[0]).toBe(footer[0]);
    expect(header[2]).toBe(footer[2]);
  });

  /**
   * A header is measured from the paper edge, so its top inset is the ONLY
   * thing between the org name and the trim. Zero printed it flush against the
   * top of the sheet, in every report, because the furniture is what all seven
   * builders spread.
   */
  it("pads the header off the top edge of the paper", () => {
    for (const orientation of ["portrait", "landscape"] as const) {
      const [, padTop] = pageFurniture(meta(), orientation).header(1, 1)
        .margin as [number, number, number, number];
      expect(padTop).toBeGreaterThan(0);
    }
  });

  it("carries the title and author into the PDF info", () => {
    const m = meta();
    expect(pageFurniture(m, "portrait").info).toEqual({
      title: m.title,
      author: m.generatedBy,
    });
  });

  /**
   * pdfmake lays out every node that names no font in `defaultStyle.font`, and
   * its own fallback is `Roboto` -- a family this app deliberately does not
   * ship (spec 5.7). A document that leaves the font out therefore dies on its
   * first line with `File 'Roboto-Regular.ttf' not found in virtual file
   * system`, which is a toast and no file rather than a visible error.
   */
  it("names the one registered family, never pdfmake's absent Roboto fallback", () => {
    expect(pageFurniture(meta(), "portrait").defaultStyle).toEqual({
      font: "Helvetica",
      fontSize: 12,
    });
  });
});

describe("header", () => {
  it("omits the filter echo entirely when no filter is active", () => {
    const stack = headerStack(
      pageFurniture(meta({ filterEcho: null }), "portrait"),
    );
    expect(textOf(stack).some((t) => t.startsWith("Filters:"))).toBe(false);
    // not merely empty -- the node does not exist at all
    expect(stack).toHaveLength(3);
  });

  it("adds exactly one filter node when filters are active", () => {
    const stack = headerStack(
      pageFurniture(
        meta({ filterEcho: "Step: Assessment, Status: Pending" }),
        "portrait",
      ),
    );
    const filterNodes = stack.filter((node) =>
      String(node.text ?? "").startsWith("Filters:"),
    );
    expect(filterNodes).toHaveLength(1);
    expect(filterNodes[0].text).toBe(
      "Filters: Step: Assessment, Status: Pending",
    );
    expect(filterNodes[0].italics).toBe(true);
  });

  it("names the org, the title, and the generator", () => {
    const m = meta();
    const stack = headerStack(pageFurniture(m, "portrait"));
    expect(stack[0].text).toBe(ORG_NAME);
    expect(stack[1].text).toBe(m.title);
    expect(stack[2].text).toBe(
      `Generated by ${m.generatedBy} on ${m.generatedOn}`,
    );
  });
});

/**
 * pdfmake has no `border` property on a node, and it says nothing about an
 * unknown key: the sketch's `border: [false, false, true, false]` parsed and
 * drew nothing, so every report printed without the rule under its header. The
 * rule is a canvas LINE, and its length is the text column's width.
 */
describe("the rule under the header", () => {
  it("is a 1px line spanning the portrait text column", () => {
    const line = ruleOf(pageFurniture(meta(), "portrait"));
    expect(line.type).toBe("line");
    expect(line.lineWidth).toBe(1);
    // A4 (595.28pt) less the 40pt left and right margins.
    expect(line.x2).toBeCloseTo(515.28, 2);
  });

  it("spans the wider text column in landscape", () => {
    const line = ruleOf(pageFurniture(meta(), "landscape"));
    // A4 turned on its side (841.89pt) less the 32pt margins.
    expect(line.x2).toBeCloseTo(777.89, 2);
  });

  /**
   * The rule is measured inside the header, whose coordinate zero the node's
   * own left inset moves -- so `x2` is the text column's WIDTH, and the rule
   * starts where the tables start only because both are inset by the same
   * left margin. Derived from `pageMargins` rather than restated, because a
   * hardcoded 515.28 passed happily while the tuple was transposed and the
   * rule was really spanning 525.28.
   */
  it("spans exactly the width the body is laid out in", () => {
    for (const [orientation, sheetWidth] of [
      ["portrait", 595.28],
      ["landscape", 841.89],
    ] as const) {
      const doc = pageFurniture(meta(), orientation);
      const [left, , right] = doc.pageMargins;
      expect(ruleOf(doc).x2).toBeCloseTo(sheetWidth - left - right, 2);
    }
  });

  it("starts at the header's own left inset, not at the paper edge", () => {
    const doc = pageFurniture(meta(), "portrait");
    const inset = (doc.header(1, 1).margin as number[])[0];
    expect(inset).toBe(doc.pageMargins[0]);
    // the line is authored from the column's own zero, so the node's inset is
    // the only thing keeping it off the sheet edge
    expect(ruleOf(doc).x1).toBe(0);
  });
});

/**
 * The AY + semester is PAGE furniture (spec 5.6 / 7.4): it has to be on every
 * page of every report, including the continuation pages of a record sheet that
 * overflows, which is why it belongs here and not only in a report body.
 */
describe("the header's academic-year column", () => {
  it("sits beside the logo and the stack, right-aligned, as its own column", () => {
    const columns = headerColumns(pageFurniture(meta(), "portrait"));
    expect(columns).toHaveLength(3);
    expect(columns[0].image).toBe(LOGO_KEY);
    expect(columns[2]).toEqual({
      text: "AY 2025-2026 - 1st Sem",
      fontSize: 8,
      alignment: "right",
    });
  });

  it("names the label and the semester the caller was given", () => {
    const columns = headerColumns(
      pageFurniture(
        meta({ yearLabel: "2026-2027", semester: "2nd Sem" }),
        "portrait",
      ),
    );
    expect(columns[2].text).toBe("AY 2026-2027 - 2nd Sem");
  });

  it("is omitted entirely, rather than printed as a dangling 'AY  - ', when there is no year", () => {
    const columns = headerColumns(
      pageFurniture(meta({ yearLabel: "" }), "portrait"),
    );
    expect(columns).toHaveLength(2);
    expect(JSON.stringify(columns)).not.toContain("AY ");
  });

  it("treats a whitespace-only label as no year at all", () => {
    const columns = headerColumns(
      pageFurniture(meta({ yearLabel: "   " }), "portrait"),
    );
    expect(columns).toHaveLength(2);
  });

  it("drops the separator, not the year, when the semester is empty", () => {
    const columns = headerColumns(
      pageFurniture(meta({ semester: "" }), "portrait"),
    );
    expect(columns).toHaveLength(3);
    // not `AY 2025-2026 - ` -- a separator with nothing after it
    expect(columns[2].text).toBe("AY 2025-2026");
  });

  it("treats a whitespace-only semester as no semester at all", () => {
    const columns = headerColumns(
      pageFurniture(meta({ semester: "  " }), "portrait"),
    );
    expect(columns[2].text).toBe("AY 2025-2026");
  });
});

/**
 * The pdfmake table node these helpers build. Both halves of the shape are
 * load-bearing: rows under `table` (a top-level `body` makes the whole document
 * stop with `Unrecognized document structure`), and `headerRows` as a COUNT --
 * the boolean `headerRow` the sketch used was ignored, so a capped 1,000-row
 * register would not have repeated its heading on the next page.
 */
describe("simpleTable", () => {
  it("wraps the header and rows in pdfmake's `table` node", () => {
    expect(
      simpleTable(["Role", "Users"], [["Student", "12"]], ["*", 70]),
    ).toEqual({
      table: {
        headerRows: 1,
        dontBreakRows: true,
        widths: ["*", 70],
        body: [
          ["Role", "Users"],
          ["Student", "12"],
        ],
      },
    });
  });
});

describe("keyValueGrid", () => {
  it("wraps the rows in pdfmake's `table` node, with no header row to repeat", () => {
    const node = keyValueGrid([["Full name", "Ana Reyes"]]);
    expect(node).toEqual({
      table: {
        dontBreakRows: true,
        widths: [110, "*"],
        body: [
          [
            { text: "Full name", style: "th" },
            { text: "Ana Reyes", style: "td" },
          ],
        ],
      },
    });
    // every row is data, so pdfmake must not repeat the first one
    expect((node.table as { headerRows?: number }).headerRows).toBeUndefined();
  });
});

describe("footer", () => {
  it("builds Page N of M from the (currentPage, pageCount) arguments", () => {
    const doc = pageFurniture(meta(), "portrait");
    expect(footerColumns(doc)[0].text).toBe(ORG_NAME);

    const at = (page: number, count: number) =>
      (doc.footer(page, count).columns as Column[])[1].text;

    expect(at(1, 1)).toBe("Page 1 of 1");
    expect(at(3, 12)).toBe("Page 3 of 12");
    expect(at(12, 12)).toBe("Page 12 of 12");
  });

  it("shows no truncation note when the report is complete", () => {
    const doc = pageFurniture(meta({ truncated: false }), "portrait");
    expect(footerColumns(doc)).toHaveLength(2);
  });

  it("shows the truncation note when the row cap bit", () => {
    const doc = pageFurniture(
      meta({
        truncated: true,
        returnedCount: REPORT_ROW_CAP,
        matchedCount: 3412,
      }),
      "portrait",
    );
    const columns = footerColumns(doc);
    expect(columns).toHaveLength(3);
    expect(columns[2].text).toBe(
      `Showing ${REPORT_ROW_CAP.toLocaleString("en-US")} of 3,412 rows - narrow your filters.`,
    );
    expect(columns[2].alignment).toBe("center");
  });
});
