// ponytail: test suite >400 lines; split deferred - shared setup/mocks make scenario boundaries unclear without a module-level refactor; leave intact.
import { describe, expect, it, vi } from "vitest";

/**
 * The engine is mocked, not imported (spec 5.19). What these tests are about is
 * the SHAPE of the call `downloadReport` makes: 0.3's `download` is async, and
 * a caller that does not await it resolves while the render is still failing.
 */
const { engineDownload, engineGetBlob } = vi.hoisted(() => ({
  engineDownload: vi.fn(),
  engineGetBlob: vi.fn(),
}));

vi.mock("./pdf", () => ({
  loadPdfMake: async () => ({
    createPdf: () => ({ download: engineDownload, getBlob: engineGetBlob }),
  }),
}));

import { buildEnrollmentSummary } from "./builders/admin-enrollment-summary";
import { buildUserDirectory } from "./builders/admin-user-directory";
import { buildRosterReport } from "./builders/instructor-roster";
import { buildStepStatusSummary } from "./builders/officer-step-summary";
import { buildStepRegister } from "./builders/officer-step-register";
import { buildRecordSheet } from "./builders/record-sheet";
import {
  REPORT_BUILDERS,
  assembleFilterEcho,
  downloadReport,
  generateReport,
  prepareReport,
  renderReportBlob,
} from "./download";
import type { GenerateReportInput } from "./download";
import { ORG_NAME } from "./format";
import type { ReportDocDefinition, ReportKind } from "./types";

const FIXED_NOW = new Date("2026-03-04T02:00:00Z");

/** The filename's timezone pin, asserted literally. */
const FILENAME_DATE = "2026-03-04";

/** The shape `ReportsPanel` used to hand over, and the reason it went unnoticed. */
const PREVIEW_SHAPED_COUNTS = {
  returned: 1000,
  matched: 3412,
  truncated: true,
};

const BASE = {
  role: "officer",
  generatedBy: "R. Dela Cruz",
  yearLabel: "2025-2026",
  semester: "1st Sem",
  now: FIXED_NOW,
} as const;

type Saved = { doc: ReportDocDefinition; filename: string };

function saver(): {
  save: (doc: ReportDocDefinition, filename: string) => Promise<void>;
  calls: Saved[];
} {
  const calls: Saved[] = [];
  return {
    calls,
    save: async (doc, filename) => {
      calls.push({ doc, filename });
    },
  };
}

const STEP_REGISTER_PAYLOAD = {
  year: { id: "y1", label: "2025-2026", semesterLabel: "1st Sem" },
  step: { code: "ASSESSMENT", name: "Assessment" },
  rows: [],
  matchedCount: 0,
  truncated: false,
};

describe("REPORT_BUILDERS", () => {
  it("maps every kind to the builder that serves it", () => {
    expect(REPORT_BUILDERS).toEqual({
      record: buildRecordSheet,
      "step-summary": buildStepStatusSummary,
      "step-register": buildStepRegister,
      roster: buildRosterReport,
      "enrollment-summary": buildEnrollmentSummary,
      "user-directory": buildUserDirectory,
    });
  });

  it("covers the whole ReportKind union, with no spare keys", () => {
    const kinds: ReportKind[] = [
      "record",
      "step-summary",
      "step-register",
      "roster",
      "enrollment-summary",
      "user-directory",
    ];
    expect(Object.keys(REPORT_BUILDERS).sort()).toEqual([...kinds].sort());
    for (const kind of kinds) {
      expect(typeof REPORT_BUILDERS[kind]).toBe("function");
    }
  });
});

describe("assembleFilterEcho", () => {
  it("is null when nothing is active, so the header prints no Filters line", () => {
    expect(assembleFilterEcho([])).toBeNull();
  });

  it("is null when every control is at its default", () => {
    expect(
      assembleFilterEcho([
        { label: "Step", value: "" },
        { label: "Status", value: null },
        { label: "Search", value: undefined },
        { label: "Sort", value: "   " },
      ]),
    ).toBeNull();
  });

  it("joins the active filters with the label each was read under", () => {
    expect(
      assembleFilterEcho([
        { label: "Step", value: "Assessment" },
        { label: "Status", value: "Verified" },
        { label: "Search", value: "" },
        { label: "Scope", value: "All departments" },
      ]),
    ).toBe("Step: Assessment, Status: Verified, Scope: All departments");
  });

  it("trims a value rather than printing a stray space", () => {
    expect(assembleFilterEcho([{ label: "Search", value: "  reyes  " }])).toBe(
      "Search: reyes",
    );
  });

  // Every other fixture in this file is ASCII, which is exactly why a curly
  // apostrophe in a real account name shipped as a `?` on every page.
  it("folds a typographic apostrophe in a search term", () => {
    expect(
      assembleFilterEcho([{ label: "Search", value: "Ana\u2019s cohort" }]),
    ).toBe("Search: Ana's cohort");
  });

  it("folds an em dash and an ellipsis in a department name", () => {
    expect(
      assembleFilterEcho([
        {
          label: "Course",
          value: "BS Information Technology \u2014 Second batch\u2026",
        },
      ]),
    ).toBe("Course: BS Information Technology - Second batch...");
  });

  it("leaves the label alone -- it is the bar's own vocabulary, not user input", () => {
    expect(
      assembleFilterEcho([{ label: "Year level", value: "2nd Year" }]),
    ).toBe("Year level: 2nd Year");
  });
});

describe("downloadReport", () => {
  const DOC = REPORT_BUILDERS["step-register"](STEP_REGISTER_PAYLOAD as never, {
    title: "Step Verification Register",
    generatedBy: "R. Dela Cruz",
    generatedOn: "04 Mar 2026",
    yearLabel: "2025-2026",
    semester: "1st Sem",
    filterEcho: null,
  });

  it("hands the filename to the engine and resolves when the render does", async () => {
    engineDownload.mockReset();
    engineDownload.mockResolvedValueOnce(undefined);

    await expect(
      downloadReport(DOC, "officer-step-register.pdf"),
    ).resolves.toBeUndefined();
    expect(engineDownload).toHaveBeenCalledWith("officer-step-register.pdf");
  });

  /**
   * The bug this locks out: `download` rendered asynchronously and its rejection
   * was floating, so the panel showed "PDF downloaded" while nothing was ever
   * written -- which is what a document the engine rejected looked like.
   */
  it("propagates a failed render to its caller instead of resolving anyway", async () => {
    engineDownload.mockReset();
    engineDownload.mockRejectedValueOnce(
      new Error("Unrecognized document structure"),
    );

    await expect(
      downloadReport(DOC, "officer-step-register.pdf"),
    ).rejects.toThrow(/Unrecognized document structure/);
  });
});

describe("prepareReport", () => {
  it("builds and names the document without writing a file", async () => {
    const save = vi.fn();

    const prepared = await prepareReport({
      ...BASE,
      kind: "step-register",
      title: "Step Verification Register",
      discriminator: "ASSESSMENT",
      load: async () => STEP_REGISTER_PAYLOAD,
      save,
    });

    expect(prepared.filename).toBe(
      `officer-step-register-assessment-${FILENAME_DATE}.pdf`,
    );
    expect(prepared.doc.info.title).toBe("Step Verification Register");
    expect(save).not.toHaveBeenCalled();
  });
});

describe("renderReportBlob", () => {
  it("renders the document without saving it", async () => {
    const blob = new Blob(["%PDF"], { type: "application/pdf" });
    engineGetBlob.mockReset();
    engineDownload.mockReset();
    engineGetBlob.mockResolvedValueOnce(blob);

    await expect(
      renderReportBlob(
        REPORT_BUILDERS["step-register"](STEP_REGISTER_PAYLOAD as never, {
          title: "Step Verification Register",
          generatedBy: "R. Dela Cruz",
          generatedOn: "04 Mar 2026",
          yearLabel: "2025-2026",
          semester: "1st Sem",
          filterEcho: null,
        }),
      ),
    ).resolves.toBe(blob);
    expect(engineDownload).not.toHaveBeenCalled();
  });
});

describe("generateReport", () => {
  it("names the file from the role, the kind, the discriminator and the Manila date", async () => {
    const { save, calls } = saver();

    const filename = await generateReport({
      ...BASE,
      kind: "step-register",
      title: "Step Verification Register",
      discriminator: "ASSESSMENT",
      load: async () => STEP_REGISTER_PAYLOAD,
      save,
    });

    expect(filename).toBe(
      `officer-step-register-assessment-${FILENAME_DATE}.pdf`,
    );
    expect(calls[0].filename).toBe(filename);
  });

  it("collapses the discriminator for a batch of record sheets", async () => {
    const { save } = saver();

    const filename = await generateReport({
      ...BASE,
      kind: "record",
      title: "Student Verification Record",
      discriminator: null,
      load: async () => [],
      save,
    });

    expect(filename).toBe(`officer-record-${FILENAME_DATE}.pdf`);
  });

  it("dispatches on kind: a record batch reaches the record sheet", async () => {
    const { save, calls } = saver();

    await generateReport({
      ...BASE,
      kind: "record",
      title: "Student Verification Record",
      load: async () => [],
      save,
    });

    const { doc } = calls[0];
    // The record sheet is the portrait one; the register is landscape. If the
    // dispatch were wrong the orientation would not match the catalogue.
    expect(doc.pageOrientation).toBe("portrait");
    expect(doc.info).toEqual({
      title: "Student Verification Record",
      author: "R. Dela Cruz",
    });
  });

  it("dispatches on kind: the register reaches the landscape builder", async () => {
    const { save, calls } = saver();

    await generateReport({
      ...BASE,
      kind: "step-register",
      title: "Step Verification Register",
      discriminator: "CONSENT",
      load: async () => ({
        ...STEP_REGISTER_PAYLOAD,
        step: { code: "CONSENT", name: "Consent" },
      }),
      save,
    });

    expect(calls[0].doc.pageOrientation).toBe("landscape");
    expect(calls[0].filename).toBe(
      `officer-step-register-consent-${FILENAME_DATE}.pdf`,
    );
  });

  it("assembles the meta the furniture prints", async () => {
    const { save, calls } = saver();

    await generateReport({
      ...BASE,
      kind: "step-register",
      title: "Step Verification Register",
      filters: [
        { label: "Step", value: "Assessment" },
        { label: "Status", value: "" },
      ],
      load: async () => STEP_REGISTER_PAYLOAD,
      save,
    });

    // `04 Mar 2026` -- formatDate's Asia/Manila pin, not the runner's zone.
    const header = calls[0].doc.header(1, 1);
    const printed = JSON.stringify(header);
    expect(printed).toContain("Generated by R. Dela Cruz on 04 Mar 2026");
    expect(printed).toContain("Step Verification Register");
    // Only the ACTIVE filter reaches the document.
    expect(printed).toContain("Filters: Step: Assessment");
    expect(printed).not.toContain("Status:");
  });

  it("repeats the server's cap sentence in the footer, and only when truncated", async () => {
    const truncated = saver();
    const complete = saver();

    await generateReport({
      ...BASE,
      kind: "step-register",
      title: "Step Verification Register",
      counts: { matchedCount: 3412, returnedCount: 1000, truncated: true },
      load: async () => STEP_REGISTER_PAYLOAD,
      save: truncated.save,
    });
    await generateReport({
      ...BASE,
      kind: "step-register",
      title: "Step Verification Register",
      counts: { matchedCount: 40, returnedCount: 40, truncated: false },
      load: async () => STEP_REGISTER_PAYLOAD,
      save: complete.save,
    });

    expect(JSON.stringify(truncated.calls[0].doc.footer(1, 9))).toContain(
      "Showing 1,000 of 3,412 rows - narrow your filters.",
    );
    expect(JSON.stringify(complete.calls[0].doc.footer(1, 1))).not.toContain(
      "narrow your filters",
    );
  });

  /**
   * The compile-time half of the counts contract. A runtime test cannot catch
   * this: the panel passed its `{ returned, matched, truncated }` preview
   * object straight through, TypeScript applied no excess-property check to a
   * variable, and the footer printed no cap notice for a whole release. These
   * two directives are assertions -- if the type ever loosens again,
   * `pnpm --filter web check` fails with "unused '@ts-expect-error' directive".
   */
  it("refuses a counts bag whose field names are the panel preview's, at compile time", () => {
    const accepts = (_input: GenerateReportInput) => {};

    accepts({
      ...BASE,
      kind: "step-register",
      title: "Step Verification Register",
      load: async () => STEP_REGISTER_PAYLOAD,
      // @ts-expect-error `matchedCount`/`returnedCount` are the required names;
      // the panel's own preview shape is not assignable to them.
      counts: { returned: 1000, matched: 3412, truncated: true },
    });

    accepts({
      ...BASE,
      kind: "step-register",
      title: "Step Verification Register",
      load: async () => STEP_REGISTER_PAYLOAD,
      // @ts-expect-error a variable of the wrong shape fails the same way, so
      // the bug cannot come back by way of a local `preview` object.
      counts: PREVIEW_SHAPED_COUNTS,
    });
  });

  it("folds a non-ASCII generator name and filter text once, at assembly", async () => {
    const { save, calls } = saver();

    await generateReport({
      ...BASE,
      kind: "step-register",
      title: "Step Verification Register",
      generatedBy: "Ma\u2019ry Joy Dizon \u2014 Registrar",
      filters: [
        { label: "Search", value: "Ana\u2019s \u2014 cohort\u2026" },
        { label: "Status", value: "" },
      ],
      load: async () => STEP_REGISTER_PAYLOAD,
      save,
    });

    const header = calls[0].doc.header(1, 1);
    const printed = JSON.stringify(header);
    // Folded to WinAnsi-safe ASCII, not dropped and not left as `?`.
    expect(printed).toContain(
      "Generated by Ma'ry Joy Dizon - Registrar on 04 Mar 2026",
    );
    expect(printed).toContain("Filters: Search: Ana's - cohort...");
    // No U+2014 survives anywhere in the serialised document (spec 12.10).
    expect(printed).not.toContain("\u2014");
    // And no `?` stands in for a character that has an ASCII spelling.
    expect(printed).not.toContain("?");
  });

  it("leaves the spec-authored strings un-folded, because they are already ASCII", async () => {
    const { save, calls } = saver();

    await generateReport({
      ...BASE,
      kind: "step-register",
      title: "Step Verification Register",
      generatedBy: "R. Dela Cruz",
      load: async () => STEP_REGISTER_PAYLOAD,
      save,
    });

    const printed = JSON.stringify(calls[0].doc.header(1, 1));
    expect(printed).toContain(ORG_NAME);
  });

  it("resolves the data before it builds, so a failing load never opens a file", async () => {
    const save = vi.fn();
    const boom = new Error("network down");

    await expect(
      generateReport({
        ...BASE,
        kind: "record",
        title: "Student Verification Record",
        load: async () => {
          throw boom;
        },
        save,
      }),
    ).rejects.toBe(boom);
    expect(save).not.toHaveBeenCalled();
  });

  it("surfaces a builder's failure to the caller rather than swallowing it", async () => {
    await expect(
      generateReport({
        ...BASE,
        kind: "step-summary",
        title: "Step Status Summary",
        // The builder maps `overview.steps`; a null is not a shape it accepts.
        load: async () => null,
        save: async () => {},
      }),
    ).rejects.toBeTruthy();
  });
});
