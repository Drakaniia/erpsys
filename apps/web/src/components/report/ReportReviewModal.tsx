import ModalShell from "../ui/ModalShell";
import { formatCount } from "$lib/report/format";
import type { PreparedReview } from "$lib/report/review";

/**
 * The confirmation step every PDF export now goes through: the real document is
 * rendered once, shown here, and saved only when the user says so. The left
 * column is the file itself; the right column repeats what its header will
 * print, so the two can never disagree.
 */
export default function ReportReviewModal({
  review,
  onclose,
  onconfirm,
}: {
  review: PreparedReview;
  onclose: () => void;
  onconfirm: () => void;
}) {
  const { summary } = review;
  const returned = summary.returnedCount;
  const matched = summary.matchedCount;
  const partial = returned !== null && matched !== null && returned !== matched;
  const sizeKb = Math.max(1, Math.round(review.blob.size / 1024));

  return (
    <ModalShell
      open
      size="lg"
      labelledby="report-review-title"
      describedby={summary.description ? "report-review-desc" : undefined}
      title="Review report"
      subtitle={summary.title}
      onclose={onclose}
      footer={
        <div className="border-t border-border/70 bg-surface/60 px-5 py-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="text-[11px] uppercase tracking-[0.14em] text-muted">
                File
              </p>
              <p className="truncate font-mono text-xs text-ink">
                {summary.filename}
                <span className="ml-1.5 font-sans text-[11px] text-muted">
                  PDF &middot; {sizeKb} KB
                </span>
              </p>
            </div>
            <div className="flex shrink-0 gap-2">
              <button
                type="button"
                onClick={onclose}
                className="press rounded-xl border border-border bg-white px-4 py-2.5 text-sm font-medium text-ink transition-[transform,background-color,border-color] duration-100 ease-out hover:bg-surface active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onconfirm}
                className="press inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-white shadow-[0_1px_2px_rgba(16,24,40,0.08)] transition-[transform,background-color] duration-100 ease-out hover:bg-primary-soft active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M12 3v12" />
                  <path d="m7 10 5 5 5-5" />
                  <path d="M5 21h14" />
                </svg>
                Download PDF
              </button>
            </div>
          </div>
        </div>
      }
    >
      <div className="grid min-h-0 gap-4 overflow-y-auto px-5 pb-5 md:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
        <figure className="order-2 min-w-0 md:order-1">
          <div className="overflow-hidden rounded-xl border border-border bg-white shadow-[0_1px_2px_rgba(16,24,40,0.06),0_24px_48px_-24px_rgba(16,24,40,0.35)]">
            <iframe
              src={review.url}
              title={`Preview of ${summary.filename}`}
              className="block h-[44vh] max-h-[420px] w-full border-0 md:h-[58vh] md:max-h-[540px]"
            />
          </div>
          <figcaption className="mt-2 flex items-center justify-between gap-3 text-[11px] text-muted">
            <span>The document as it will be saved.</span>
            <a
              href={review.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded font-medium text-primary underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              Open full page
              <svg
                width="11"
                height="11"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M14 4h6v6" />
                <path d="M20 4 11 13" />
                <path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
              </svg>
            </a>
          </figcaption>
        </figure>

        <div className="order-1 min-w-0 space-y-4 text-sm md:order-2">
          {summary.description ? (
            <p id="report-review-desc" className="leading-5 text-muted">
              {summary.description}
            </p>
          ) : null}

          {returned !== null ? (
            <div className="rounded-xl border border-border bg-surface-raised px-4 py-3">
              <p className="flex items-baseline gap-1.5">
                <span className="text-2xl font-semibold tracking-tight text-ink tabular-nums">
                  {formatCount(returned)}
                </span>
                <span className="text-sm text-muted">
                  {returned === 1 ? "row" : "rows"} in this PDF
                </span>
              </p>
              {partial && matched !== null ? (
                <p className="mt-0.5 text-xs text-muted tabular-nums">
                  of {formatCount(matched)} matching rows
                </p>
              ) : null}
            </div>
          ) : null}

          {summary.capNotice ? (
            <p
              role="status"
              className="rounded-lg border border-warning/30 bg-warning/[0.06] px-3 py-2 text-xs leading-5 text-warning"
            >
              {summary.capNotice}
            </p>
          ) : null}

          <dl className="space-y-2">
            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-muted">Period</dt>
              <dd className="min-w-0 text-right font-medium text-ink">
                {summary.period || "\u2014"}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-muted">Generated by</dt>
              <dd className="min-w-0 truncate text-right font-medium text-ink">
                {summary.generatedBy}
              </dd>
            </div>
          </dl>

          <div className="border-t border-border/70 pt-3">
            <p className="text-[11px] uppercase tracking-[0.14em] text-muted">
              Filters
            </p>
            {summary.filters.length > 0 ? (
              <ul className="mt-1.5 flex flex-wrap gap-1.5">
                {summary.filters.map((filter) => (
                  <li
                    key={filter}
                    className="rounded-full border border-border bg-white px-2.5 py-1 text-[11px] text-ink/80"
                  >
                    {filter}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-xs leading-5 text-muted">
                No filters &mdash; this report covers everything in its scope.
              </p>
            )}
          </div>

          {summary.authenticityNote ? (
            <p className="border-t border-border/70 pt-3 text-xs leading-5 text-muted">
              {summary.authenticityNote}
            </p>
          ) : null}
        </div>
      </div>
    </ModalShell>
  );
}
