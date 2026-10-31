import { buildEnrollmentSummary } from "./builders/admin-enrollment-summary";
import { buildUserDirectory } from "./builders/admin-user-directory";
import { buildRosterReport } from "./builders/instructor-roster";
import { buildStepStatusSummary } from "./builders/officer-step-summary";
import { buildStepRegister } from "./builders/officer-step-register";
import { buildRecordSheet } from "./builders/record-sheet";
import { buildReportFilename } from "./filename";
import { formatDate, toWinAnsi } from "./format";
import { loadPdfMake } from "./pdf";
import type {
  ReportDocDefinition,
  ReportKind,
  ReportMeta,
  ReportRole,
} from "./types";

/**
 * The ONLY module that knows about pdfmake's `createPdf`. Everything above it
 * deals in the local `ReportDocDefinition` structural type and never imports
 * the engine (spec 7.6 / 9.1).
 *
 * Errors are surfaced to the caller rather than swallowed, so the Reports panel
 * can raise a toast (spec 5.15).
 */
export async function downloadReport(
  doc: ReportDocDefinition,
  filename: string,
): Promise<void> {
  const pdfMake = await loadPdfMake();
  // AWAITED. `download` is async in 0.3 -- it lays the document out and renders
  // it before saving -- so an un-awaited call resolves the panel's success
  // toast while the render is still failing behind it. That is exactly how a
  // document whose table or font the engine rejects showed "PDF downloaded"
  // and wrote no file.
  await pdfMake.createPdf(doc).download(filename);
}

/**
 * Renders the document to a blob WITHOUT saving it, so the review modal can
 * show the real pages before anyone commits to a download. Same awaited render
 * as `downloadReport`: a rejected layout must reach the caller, not float.
 */
export async function renderReportBlob(
  doc: ReportDocDefinition,
): Promise<Blob> {
  const pdfMake = await loadPdfMake();
  return pdfMake.createPdf(doc).getBlob();
}

/**
 * Every builder takes a different payload, so the dispatch is a cast rather than
 * a union of call signatures: the six data shapes are the server's contracts and
 * are checked where each builder consumes them, not a second time here. `never`
 * is the parameter type precisely so that a caller cannot reach the cast from the
 * outside -- `generateReport` is the only door in, and it passes an `unknown`
 * it never inspects.
 */
export type ReportBuilderFn = (
  data: never,
  meta: ReportMeta,
) => ReportDocDefinition;

/** The one place a `ReportKind` becomes a builder (spec 9.1). */
export const REPORT_BUILDERS: Record<ReportKind, ReportBuilderFn> = {
  record: buildRecordSheet as ReportBuilderFn,
  "step-summary": buildStepStatusSummary as ReportBuilderFn,
  "step-register": buildStepRegister as ReportBuilderFn,
  roster: buildRosterReport as ReportBuilderFn,
  "enrollment-summary": buildEnrollmentSummary as ReportBuilderFn,
  "user-directory": buildUserDirectory as ReportBuilderFn,
};

/** One `Filters:` fragment, as the filter bar read the value off the control. */
export type FilterEchoEntry = {
  label: string;
  value: string | null | undefined;
};

/**
 * The header's filter line (spec 5.6 / 7.4). A control left at its default has
 * an empty value and is DROPPED, so the echo names only what the user actually
 * narrowed -- and an entirely default filter set yields `null`, which
 * `pageFurniture` renders as no `Filters:` line at all rather than an empty one.
 *
 * Each VALUE is folded through `toWinAnsi` here rather than by the caller: the
 * values are whatever the console read off the URL and out of the database, and
 * folding them where the echo is assembled means no caller has to remember
 * (spec 7.1, 12.10). The LABEL is left alone -- it is the filter bar's own
 * vocabulary, not user input.
 */
export function assembleFilterEcho(
  entries: readonly FilterEchoEntry[],
): string | null {
  const parts: string[] = [];
  for (const entry of entries) {
    const value = (entry.value ?? "").trim();
    if (!value) continue;
    parts.push(`${entry.label}: ${toWinAnsi(value)}`);
  }
  return parts.length > 0 ? parts.join(", ") : null;
}

/**
 * The row counts the document's footer needs, named exactly as the server's
 * capped payload names them.
 *
 * Every field is REQUIRED. That is the whole point: the panel holds these in a
 * local `{ returned, matched, truncated }` preview object, and against a type
 * whose fields were optional that object was silently assignable -- the footer
 * then called `truncationNotice(0, 0)`, which returns `""`, and the cap notice
 * the spec requires the PDF to repeat (12.6) never appeared. Required fields
 * make a wrong name a COMPILE error whether the value arrives as a literal or
 * as a variable, which no runtime assertion here could do.
 */
export type ReportCounts = {
  matchedCount: number;
  returnedCount: number;
  truncated: boolean;
};

export type GenerateReportInput = {
  role: ReportRole;
  kind: ReportKind;
  /** The catalogue label, verbatim -- it is the document's printed title. */
  title: string;
  /** The generating user, for the furniture's "Generated by" line. */
  generatedBy: string;
  yearLabel: string;
  semester: string;
  /** Whatever the filter bar currently holds active. */
  filters?: readonly FilterEchoEntry[];
  /**
   * Fetches the report's data, or reads it from a query the console has already
   * run. Deferred rather than passed as a value because R1's record batch is
   * only assembled at generate time, while R3/R4/R6 reuse the preview rows.
   */
  load: () => Promise<unknown>;
  /** Step code for the register, slugified student name for a record sheet. */
  discriminator?: string | null;
  /** A self-service note for the subject's own copy (see `ReportMeta`). */
  authenticityNote?: string | null;
  /** Absent only for a report with no rowset (R1, R2, R5). */
  counts?: ReportCounts;
  /**
   * The catalogue's own one-line description, shown in the review modal. It is
   * never printed -- the PDF furniture owns its own subtitle -- so it is not
   * part of `ReportMeta`.
   */
  description?: string;
  /** Injected by the tests; production always goes through `downloadReport`. */
  save?: (doc: ReportDocDefinition, filename: string) => Promise<void>;
  now?: Date;
};

/** A laid-out document plus the name it will be saved under. */
export type PreparedReport = {
  doc: ReportDocDefinition;
  filename: string;
};

/**
 * The whole generate flow MINUS the save (spec 9.4 steps 3-5): resolve the
 * data, assemble the `ReportMeta`, dispatch to the builder for `kind`, name the
 * file. Split out so the review modal can render and inspect this document
 * before a single byte is written to disk.
 */
export async function prepareReport(
  input: GenerateReportInput,
): Promise<PreparedReport> {
  const now = input.now ?? new Date();
  const data = await input.load();

  // The ONE point where user-controlled text enters the document. `generatedBy`
  // is the session user's name and every filter fragment is a `?q=` or a
  // department name, so both are folded here rather than in `pageFurniture`
  // (which must stay declarative, spec 7.1) and rather than in six builders
  // (which fold their own row data already). The spec-authored strings --
  // ORG_NAME, the report title, the furniture's own wording -- are NOT folded:
  // they are code, and a `?` in them would be a bug in this repository.
  const meta: ReportMeta = {
    title: input.title,
    generatedBy: toWinAnsi(input.generatedBy),
    generatedOn: formatDate(now),
    yearLabel: input.yearLabel,
    semester: input.semester,
    filterEcho: assembleFilterEcho(input.filters ?? []),
    matchedCount: input.counts?.matchedCount,
    returnedCount: input.counts?.returnedCount,
    truncated: input.counts?.truncated,
    authenticityNote: input.authenticityNote,
  };

  const doc = REPORT_BUILDERS[input.kind](data as never, meta);
  const filename = buildReportFilename({
    role: input.role,
    reportId: input.kind,
    discriminator: input.discriminator ?? null,
    date: now,
  });

  return { doc, filename };
}

/**
 * Prepare and download in one call, for callers that already reviewed the
 * document. Returns the filename so the caller can name it in a log.
 */
export async function generateReport(
  input: GenerateReportInput,
): Promise<string> {
  const { doc, filename } = await prepareReport(input);
  await (input.save ?? downloadReport)(doc, filename);
  return filename;
}
