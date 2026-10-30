import { truncationNotice } from "$lib/domain/report";
import {
  prepareReport,
  renderReportBlob,
  type GenerateReportInput,
} from "./download";

/**
 * The review step between "Generate PDF" and the file landing in the download
 * folder. It renders the REAL document once and keeps the blob, so the modal's
 * preview and the eventual save are the same bytes -- a user is never shown one
 * thing and handed another.
 *
 * Everything here is plain data plus two browser effects (`URL.createObjectURL`
 * and an anchor click), so the modal that consumes it stays presentational and
 * the summary is testable without pdfmake.
 */

export type ReportReviewSummary = {
  title: string;
  /** The catalogue's description, or `null` for a report that has none. */
  description: string | null;
  generatedBy: string;
  /** `AY 2025-2026 · 1st Sem`, or `""` when the report has no period. */
  period: string;
  /** Only the controls the user actually narrowed, as `Label: value`. */
  filters: string[];
  returnedCount: number | null;
  matchedCount: number | null;
  /** The server's own cap sentence, or `""` when the cap did not bite. */
  capNotice: string;
  filename: string;
  authenticityNote: string | null;
};

export type PreparedReview = {
  summary: ReportReviewSummary;
  blob: Blob;
  /** Object URL for the preview iframe; release it with `releaseReview`. */
  url: string;
};

/**
 * The modal's left column is the document itself; the right column repeats the
 * facts printed in its header. Both sides read the same `input`, so the modal
 * cannot promise a period, filter, or count the PDF does not carry.
 */
export function summarizeReview(
  input: GenerateReportInput,
  filename: string,
): ReportReviewSummary {
  const filters: string[] = [];
  for (const entry of input.filters ?? []) {
    const value = (entry.value ?? "").trim();
    if (value) filters.push(`${entry.label}: ${value}`);
  }

  const returned = input.counts?.returnedCount ?? null;
  const matched = input.counts?.matchedCount ?? null;

  return {
    title: input.title,
    description: input.description?.trim() || null,
    generatedBy: input.generatedBy,
    period: [
      input.yearLabel ? `AY ${input.yearLabel}` : "",
      input.semester?.trim() || "",
    ]
      .filter(Boolean)
      .join(" \u00b7 "),
    filters,
    returnedCount: returned,
    matchedCount: matched,
    capNotice:
      returned !== null && matched !== null
        ? truncationNotice(returned, matched)
        : "",
    filename,
    authenticityNote: input.authenticityNote?.trim() || null,
  };
}

/** Builds the document, renders it once, and hands back a reviewable copy. */
export async function prepareReview(
  input: GenerateReportInput,
): Promise<PreparedReview> {
  const { doc, filename } = await prepareReport(input);
  const blob = await renderReportBlob(doc);
  return {
    summary: summarizeReview(input, filename),
    blob,
    url: URL.createObjectURL(blob),
  };
}

/** Frees the preview URL. Safe to call more than once. */
export function releaseReview(review: PreparedReview): void {
  URL.revokeObjectURL(review.url);
}

/**
 * Saves the SAME blob the modal previewed -- no second render, so the file
 * cannot differ from what was reviewed. The object URL is revoked on the next
 * tick: revoking before the click is processed cancels the save in some
 * browsers, and holding it longer leaks the document for the tab's lifetime.
 */
export function saveReview(review: PreparedReview): void {
  const url = URL.createObjectURL(review.blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = review.summary.filename;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
