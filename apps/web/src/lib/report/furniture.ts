import { truncationNotice } from "$lib/domain/report";
import type {
  ContentNode,
  Orientation,
  ReportDocDefinition,
  ReportMeta,
} from "./types";
import { ORG_NAME } from "./format";

/**
 * The single key the logo is registered under in pdfmake's virtual file
 * system. It is declared HERE, not in `pdf.ts`, because the value belongs to
 * the document shape (the header references it as `image: LOGO_KEY`) rather
 * than to the engine that happens to satisfy it. `pdf.ts` imports this.
 */
export const LOGO_KEY = "cotSboLogo";

/**
 * The family `pdf.ts` registers through `addFontContainer`, and therefore the
 * only one a document may name (spec 5.7). pdfmake falls back to `Roboto` for
 * every node that names no font, and Roboto's TTF is not in the virtual file
 * system -- so this is named as the document's `defaultStyle` rather than left
 * to the engine.
 */
const DEFAULT_FONT = "Helvetica";

/** A4 in points, as pdfmake's own page-size table has it. */
const A4_WIDTH = 595.28;
const A4_HEIGHT = 841.89;

/**
 * How tall the band above the body is. This is NOT a design choice -- it is the
 * height pdfmake measures the header against, and the header's own content has
 * to fit inside it or it is silently dropped.
 *
 * pdfmake lays a header out as an unbreakable block whose page is
 * `{ width: pageWidth, height: pageMargins.top }`, then keeps only the FIRST
 * page of that block. Content that does not fit spills onto the block's second
 * page and is discarded -- not clipped, not overlapped onto the body: simply
 * gone. The header block is 39.4pt tall with no filters and 49.8pt with the
 * `Filters:` line, and the top margin it used to carry was 40.
 *
 * The band is `HEADER_BAND_BASE + HEADER_PAD_TOP` rather than one number,
 * because the padding is spent INSIDE the band: a header's coordinate zero is
 * the paper edge, so without it the org name printed hard against the top of
 * the sheet. Growing the band by the same amount keeps the header inside the
 * box pdfmake measures -- padding the header without growing the band would
 * push its rule past the band's edge and silently drop it.
 */
const HEADER_BAND_BASE = 56;
const HEADER_PAD_TOP = 16;
const HEADER_BAND = HEADER_BAND_BASE + HEADER_PAD_TOP;

/**
 * left, top, right, bottom -- one row per orientation (spec 15.3). That is
 * pdfmake's own order for a 4-element `pageMargins` array
 * (`PageSize.normalizePageMargin`), NOT the CSS order; the two differ, and
 * reading these as top/right/bottom/left silently transposed every value.
 *
 * The left and right values are the text column the body is laid out in, and
 * they are why the same two numbers are re-used as the header's and footer's
 * own inset below. The right one is not a typo: the sheet is 595.28pt and
 * 40 + 40 leaves a 515.28pt column, which is what `textWidth` has to be for
 * the header's rule to line up with the tables.
 */
const PAGE_MARGINS: Record<Orientation, [number, number, number, number]> = {
  portrait: [40, HEADER_BAND, 40, 36],
  landscape: [32, HEADER_BAND, 32, 34],
};

/**
 * The page furniture every report embeds (spec 7.4 / 15.3). Returned as the
 * docDefinition minus `content` and `styles`, so a builder spreads it and adds
 * its own body plus `styles: baseStyles()`.
 *
 * `header` and `footer` are FUNCTIONS of `(currentPage, pageCount)` -- that is
 * pdfmake's own signature, which is how `Page N of M` needs no manual counting.
 *
 * HEADER AND FOOTER CARRY THEIR OWN LEFT/RIGHT INSET, and it is not optional.
 * `pageMargins` reads like a page-wide frame, but pdfmake only applies the left
 * and right values to BODY content: it measures a header and a footer into an
 * unbreakable block of `{ x: 0, width: pageSize.width }`, so their coordinate
 * zero is the paper edge. Left alone, the org name and `Page N of M` printed
 * hard against both edges of the sheet, 40pt outboard of every table -- the
 * furniture looked like it was falling off the page, and the header's rule
 * started 40pt to the left of the tables it was supposed to cap. Insetting the
 * furniture by the same left/right margins puts the header, the rule, the
 * footer and the tables on one text column.
 */
export function pageFurniture(
  meta: ReportMeta,
  orientation: Orientation,
): Omit<ReportDocDefinition, "content" | "styles"> {
  const wide = orientation === "landscape";
  const pageMargins = PAGE_MARGINS[orientation];
  // The sheet's width for this orientation, less its left and right margins:
  // what a full-bleed rule has to span, and the width the header's columns and
  // the footer's columns are measured in. The rule is a canvas LINE because
  // pdfmake has no `border` on a non-table node -- the sketch's
  // `border: [false, false, true, false]` parsed fine and drew nothing.
  const textWidth =
    (wide ? A4_HEIGHT : A4_WIDTH) - pageMargins[0] - pageMargins[2];
  // The same left/right inset as a pdfmake node margin (left, top, right,
  // bottom) for the header and the footer to carry. See the note on
  // `pageFurniture` for why they cannot inherit it. The top value is the
  // header's own padding: its origin is the paper edge, so 0 printed the org
  // name against the top trim. The footer's top is not this one -- the footer
  // already has its own 6pt above the text, and the band is above the footer.
  const inset: [number, number, number, number] = [
    pageMargins[0],
    HEADER_PAD_TOP,
    pageMargins[2],
    0,
  ];

  return {
    pageSize: "A4",
    pageOrientation: orientation,
    pageMargins,

    header: (currentPage: number, pageCount: number): ContentNode => {
      void currentPage;
      void pageCount;

      const stack: ContentNode[] = [
        { text: ORG_NAME, fontSize: 8, characterSpacing: 0.6 },
        { text: meta.title, fontSize: 12, bold: true, margin: [0, 2, 0, 0] },
        {
          text: `Generated by ${meta.generatedBy} on ${meta.generatedOn}`,
          fontSize: 7.5,
          margin: [0, 2, 0, 0],
        },
      ];

      // OMITTED ENTIRELY when no filter is active -- never an empty "Filters:"
      // label (spec 5.6 / 7.4).
      if (meta.filterEcho) {
        stack.push({
          text: `Filters: ${meta.filterEcho}`,
          fontSize: 7,
          italics: true,
          color: "#666",
          margin: [0, 2, 0, 0],
        });
      }

      const columns: ContentNode[] = [
        { image: LOGO_KEY, width: 26, margin: [0, 0, 8, 0] },
        { stack },
      ];

      // `AY <label> - <semester>`, right-aligned in its OWN column beside the
      // logo and the stack (spec 5.6 / 7.4) -- not a fourth line in the stack,
      // which is left-aligned and would read as a fourth filter.
      //
      // OMITTED ENTIRELY when there is no active year, on the same rule as the
      // filter echo: a bare `AY  - ` is a dangling label, not a fact.
      //
      // The ` - <semester>` half is appended only when there IS a semester. A
      // year with no semester label is still a year worth printing, and
      // appending the separator regardless gave `AY 2025-2026 - ` -- a
      // separator with nothing after it.
      if (meta.yearLabel.trim()) {
        const semester = ` - ${meta.semester}`;
        columns.push({
          text: `AY ${meta.yearLabel}${meta.semester.trim() ? semester : ""}`,
          fontSize: 8,
          alignment: "right",
        });
      }

      return {
        stack: [
          { columns, columnGap: 8 },
          {
            canvas: [
              {
                type: "line",
                x1: 0,
                y1: 0,
                x2: textWidth,
                y2: 0,
                lineWidth: 1,
                lineColor: "#cccccc",
              },
            ],
            margin: [0, 4, 0, 0],
          },
        ],
        margin: [inset[0], inset[1], inset[2], 6],
      };
    },

    footer: (currentPage: number, pageCount: number): ContentNode => {
      const columns: ContentNode[] = [
        { text: ORG_NAME, fontSize: 7, color: "#888" },
        {
          text: `Page ${currentPage} of ${pageCount}`,
          fontSize: 7,
          color: "#888",
          alignment: "right",
        },
      ];

      // The truncation sentence is the server's copy (single source of truth),
      // and is only present when the row cap actually bit.
      if (meta.truncated) {
        const note = truncationNotice(
          meta.returnedCount ?? 0,
          meta.matchedCount ?? 0,
        );
        if (note) {
          columns.push({
            text: note,
            fontSize: 7,
            color: "#8a6d3b",
            alignment: "center",
          });
        }
      }

      return { columns, margin: [inset[0], 6, inset[2], inset[3]] };
    },

    info: { title: meta.title, author: meta.generatedBy },

    // pdfmake's own default is `{ fontSize: 12, font: "Roboto" }`, and Roboto is
    // not registered -- see `DEFAULT_FONT`. Named here, in the furniture every
    // report spreads, so no builder can ship a document without it.
    defaultStyle: { font: DEFAULT_FONT, fontSize: 12 },
  };
}

/**
 * The named styles the builders reference. Kept in one place so a report's
 * tables cannot drift between the seven documents (spec 7.4).
 */
export function baseStyles(): Record<string, Record<string, unknown>> {
  return {
    // section heading inside a report body
    section: { fontSize: 10, bold: true, margin: [0, 10, 0, 4] },
    // table header cell
    th: { fontSize: 7.5, bold: true, color: "#444" },
    // table body cell
    td: { fontSize: 7.5 },
    // the muted count / note line under a table
    note: { fontSize: 7.5, color: "#888" },
    // the amber truncation sentence
    warning: { fontSize: 7.5, color: "#8a6d3b" },
  };
}

/** A section heading node, matching the `section` style above. */
export function sectionTitle(text: string): ContentNode {
  return { text, style: "section" };
}

/**
 * A table whose header row repeats on continuation pages and whose rows never
 * split across a page break (spec 7.4).
 *
 * The shape is pdfmake's, and both halves of it have to be exact:
 *
 *   - the rows, the widths and the header flag live INSIDE `table`. A node with
 *     a top-level `body` is not a table at all, and the engine stops the whole
 *     document with `Unrecognized document structure`.
 *   - the flag is `headerRows: 1` -- a COUNT, not a boolean -- and
 *     `dontBreakRows` is a `table` property too. The sketch's `headerRow: true`
 *     plus node-level `dontBreakRows`/`tableLayout` were accepted silently and
 *     did nothing, so a capped 1,000-row register would not have repeated its
 *     header on the next page.
 *
 * `layout` is left unset on purpose: pdfmake then uses its default rule set
 * (1px lines all round), which is what a printed register wants.
 */
export function simpleTable(
  header: string[],
  rows: string[][],
  widths: (string | number)[],
): ContentNode {
  return {
    table: {
      headerRows: 1,
      dontBreakRows: true,
      widths,
      body: [header, ...rows],
    },
  };
}

/**
 * A two-column label/value grid, used by the record sheet's detail sections.
 * No `headerRows`: every row is data, so there is nothing to repeat.
 */
export function keyValueGrid(pairs: [string, string][]): ContentNode {
  return {
    table: {
      dontBreakRows: true,
      widths: [110, "*"],
      body: pairs.map(([label, value]) => [
        { text: label, style: "th" },
        { text: value, style: "td" },
      ]),
    },
  };
}
