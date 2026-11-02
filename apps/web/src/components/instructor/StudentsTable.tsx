import { useEffect, useRef } from "react";
import SortHeader from "./SortHeader";
import { absoluteTime, relativeTime } from "$lib/officer/format";
import {
  BUCKET_DEFINITIONS,
  BUCKET_SHORT_LABELS,
  departmentLevelTag,
  queueLabel,
  yearLevelLabel,
  type SortDir,
  type StudentSort,
} from "$lib/instructor/students";
import type { RosterRow } from "$lib/instructor/types";

// ponytail: row hover/focus <style> replaced with tailwind classes.
const BUCKET_CHIP: Record<RosterRow["bucket"], string> = {
  NOT_STARTED: "text-muted bg-surface border-border/60",
  IN_PROGRESS: "text-ink bg-gold/12 border-gold/25",
  READY_FOR_QUEUE: "text-primary bg-primary/10 border-primary/20",
  ENROLLED: "text-white bg-primary border-primary",
};

export default function StudentsTable({
  rows,
  loading = false,
  loadingMore = false,
  total,
  sort,
  dir,
  selectedIds = new Set<string>(),
  hasNextPage = false,
  hasFilters = false,
  onsort,
  onopen,
  onselect,
  onselectall,
  onloadmore,
  onopenqueue,
  onclear,
}: {
  rows: RosterRow[];
  loading?: boolean;
  loadingMore?: boolean;
  total: number | null;
  sort: StudentSort;
  dir: SortDir;
  selectedIds?: Set<string>;
  hasNextPage?: boolean;
  hasFilters?: boolean;
  onsort: (column: StudentSort) => void;
  onopen: (row: RosterRow) => void;
  onselect: (row: RosterRow) => void;
  onselectall: (checked: boolean) => void;
  onloadmore: () => void;
  onopenqueue: (departmentId: string | null) => void;
  onclear: () => void;
}) {
  const allVisibleSelected =
    rows.length > 0 &&
    rows.every((row) => selectedIds.has(row.studentProfileId));
  const someVisibleSelected = rows.some((row) =>
    selectedIds.has(row.studentProfileId),
  );
  const selectAllRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (selectAllRef.current)
      selectAllRef.current.indeterminate =
        someVisibleSelected && !allVisibleSelected;
  }, [someVisibleSelected, allVisibleSelected]);

  return (
    <>
      <div className="overflow-hidden rounded-2xl border border-border bg-surface-raised">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm" aria-label="Students">
            <thead>
              <tr className="border-b border-border">
                <th scope="col" className="w-10 px-3 py-2">
                  <input
                    type="checkbox"
                    ref={selectAllRef}
                    checked={allVisibleSelected}
                    onChange={() => onselectall(!allVisibleSelected)}
                    aria-label="Select all students on this page"
                    className="h-4 w-4 accent-primary"
                  />
                </th>
                <SortHeader
                  column="name"
                  label="Student"
                  sort={sort}
                  dir={dir}
                  extraClass="min-w-[200px]"
                  onsort={onsort}
                />
                <th
                  scope="col"
                  className="px-3 py-2 text-left text-[11px] font-medium uppercase tracking-wide text-muted hidden md:table-cell"
                >
                  Course
                </th>
                <SortHeader
                  column="yearLevel"
                  label="Year level"
                  sort={sort}
                  dir={dir}
                  extraClass="hidden sm:table-cell"
                  onsort={onsort}
                />
                <SortHeader
                  column="stepsVerified"
                  label="Steps"
                  sort={sort}
                  dir={dir}
                  onsort={onsort}
                />
                <th
                  scope="col"
                  className="px-3 py-2 text-left text-[11px] font-medium uppercase tracking-wide text-muted"
                >
                  Status
                </th>
                <th
                  scope="col"
                  className="px-3 py-2 text-left text-[11px] font-medium uppercase tracking-wide text-muted hidden lg:table-cell"
                >
                  Queue
                </th>
                <SortHeader
                  column="enrolledAt"
                  label="Enrolled at"
                  sort={sort}
                  dir={dir}
                  extraClass="hidden xl:table-cell"
                  onsort={onsort}
                />
              </tr>
            </thead>
            <tbody className="divide-y divide-border/70">
              {loading && rows.length === 0
                ? Array.from({ length: 6 }, (_, i) => (
                    <tr
                      key={i}
                      className="h-[54px]"
                      aria-hidden="true"
                      style={{ "--skeleton-i": i } as React.CSSProperties}
                    >
                      <td className="px-3">
                        <span className="skeleton block h-4 w-4 rounded" />
                      </td>
                      <td className="px-3">
                        <div className="flex items-center gap-2.5">
                          <span className="skeleton h-7 w-7 rounded-full" />
                          <span className="skeleton h-3 w-32 rounded" />
                        </div>
                      </td>
                      <td className="hidden px-3 md:table-cell">
                        <span className="skeleton block h-3 w-20 rounded" />
                      </td>
                      <td className="hidden px-3 sm:table-cell">
                        <span className="skeleton block h-3 w-14 rounded" />
                      </td>
                      <td className="px-3">
                        <span className="skeleton block h-5 w-12 rounded-full" />
                      </td>
                      <td className="px-3">
                        <span className="skeleton block h-5 w-20 rounded-full" />
                      </td>
                      <td className="hidden px-3 lg:table-cell">
                        <span className="skeleton block h-3 w-16 rounded" />
                      </td>
                      <td className="hidden px-3 xl:table-cell">
                        <span className="skeleton block h-3 w-14 rounded" />
                      </td>
                    </tr>
                  ))
                : rows.map((row) => {
                    const checked = selectedIds.has(row.studentProfileId);
                    const label = row.studentNumber
                      ? `${row.studentName}, ${row.studentNumber}`
                      : row.studentName;
                    return (
                      <tr
                        key={row.studentProfileId}
                        tabIndex={0}
                        aria-label={label}
                        className={`h-[54px] cursor-pointer transition-colors duration-100 ease-out hover:bg-ink/[0.02] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary motion-reduce:transition-none ${checked ? "bg-primary/[0.04]" : ""}`}
                        onClick={() => onopen(row)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            onopen(row);
                          }
                        }}
                      >
                        <td
                          className="px-3"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => onselect(row)}
                            aria-label={`Select ${row.studentName}`}
                            className="h-4 w-4 accent-primary"
                          />
                        </td>
                        <td className="px-3">
                          <div className="flex items-center gap-2.5">
                            <span
                              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary"
                              aria-hidden="true"
                            >
                              {(row.studentName ?? "")
                                .split(/\s+/)
                                .filter(Boolean)
                                .slice(0, 2)
                                .map(
                                  (part: string) =>
                                    part[0]?.toUpperCase() ?? "",
                                )
                                .join("")}
                            </span>
                            <span className="min-w-0">
                              <span className="block truncate font-medium text-ink">
                                {row.studentName}
                              </span>
                              <span className="block truncate text-xs tabular-nums text-muted">
                                {row.studentNumber ?? "No student #"}
                              </span>
                            </span>
                          </div>
                        </td>
                        <td className="hidden px-3 md:table-cell">
                          {row.departmentCode ? (
                            <>
                              <span className="text-ink tabular-nums">
                                {departmentLevelTag(
                                  row.departmentCode,
                                  row.yearLevel,
                                )}
                              </span>
                              <span className="block truncate text-xs text-muted">
                                {row.departmentName}
                              </span>
                            </>
                          ) : (
                            <span className="italic text-muted/70">
                              Unassigned
                            </span>
                          )}
                        </td>
                        <td className="hidden px-3 tabular-nums text-muted sm:table-cell">
                          {yearLevelLabel(row.yearLevel)}
                        </td>
                        <td className="px-3">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onopen(row);
                            }}
                            title="Open requirements"
                            className="press inline-flex items-center gap-1 rounded-full border border-primary/20 bg-primary/[0.06] px-2 py-0.5 text-xs font-medium tabular-nums text-primary"
                          >
                            {row.stepsVerified}/{row.stepsTotal}
                          </button>
                        </td>
                        <td className="px-3">
                          <span className="inline-flex flex-wrap items-center gap-1">
                            <span
                              className={`rounded-full border px-2 py-0.5 text-xs ${BUCKET_CHIP[row.bucket as keyof typeof BUCKET_CHIP]}`}
                              title={
                                BUCKET_DEFINITIONS[
                                  row.bucket as keyof typeof BUCKET_DEFINITIONS
                                ]
                              }
                            >
                              {
                                BUCKET_SHORT_LABELS[
                                  row.bucket as keyof typeof BUCKET_SHORT_LABELS
                                ]
                              }
                            </span>
                            {row.pendingReview > 0 && (
                              <span
                                className="rounded-full border border-gold/25 bg-gold/15 px-2 py-0.5 text-xs text-ink"
                                title={`${row.pendingReview} step(s) waiting for review`}
                              >
                                Review
                              </span>
                            )}
                          </span>
                        </td>
                        <td className="hidden px-3 lg:table-cell">
                          {row.queueStatus === "NONE" ? (
                            <span className="text-muted/60">—</span>
                          ) : row.departmentId ? (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onopenqueue(row.departmentId);
                              }}
                              className="press rounded text-left text-xs text-muted underline decoration-border underline-offset-2 transition-colors hover:text-ink"
                              title="Open this department's queue"
                            >
                              {queueLabel(row.queueStatus)}
                            </button>
                          ) : (
                            <span className="text-xs text-muted">
                              {queueLabel(row.queueStatus)}
                            </span>
                          )}
                        </td>
                        <td className="hidden px-3 xl:table-cell">
                          {row.enrolledAt ? (
                            <span
                              className="text-muted"
                              title={absoluteTime(row.enrolledAt)}
                            >
                              {relativeTime(row.enrolledAt)}
                            </span>
                          ) : (
                            <span className="text-muted/50">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
            </tbody>
          </table>
        </div>
        {!loading && rows.length === 0 && (
          <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
            <svg
              className="mb-3 h-8 w-8 text-muted/40"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              aria-hidden="true"
            >
              <circle cx="11" cy="11" r="7" />
              <path d="M20 20l-3.5-3.5" strokeLinecap="round" />
            </svg>
            <p className="text-sm font-medium text-muted">
              No students match these filters.
            </p>
            <p className="mt-1 text-xs text-muted/60">
              {hasFilters
                ? "Try widening the course, year level, or status filters."
                : "Students appear here once they have a course record for this academic year."}
            </p>
            {hasFilters && (
              <button
                type="button"
                onClick={onclear}
                className="press mt-3 rounded-lg border border-border px-3 py-1.5 text-sm text-muted transition-colors hover:text-ink"
              >
                Clear filters
              </button>
            )}
          </div>
        )}
      </div>
      <div className="mt-2 flex items-center justify-between gap-3">
        <span className="text-xs tabular-nums text-muted" aria-live="polite">
          {rows.length > 0 ? (
            <>
              Showing {rows.length}
              {total !== null && total > rows.length ? <> of {total}</> : null}
            </>
          ) : loading ? (
            "Loading students…"
          ) : null}
        </span>
        {hasNextPage && (
          <button
            type="button"
            onClick={onloadmore}
            disabled={loadingMore}
            className="press rounded-xl border border-border px-4 py-1.5 text-sm text-muted transition-colors hover:text-ink disabled:opacity-50"
          >
            {loadingMore ? "Loading…" : "Load more"}
          </button>
        )}
      </div>
    </>
  );
}
