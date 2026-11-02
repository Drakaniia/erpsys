import { useEffect, useRef, useState } from "react";
import { relativeTime } from "$lib/officer/format";
import Skeleton from "../ui/Skeleton";
import type { EnrolledEntry } from "$lib/instructor/types";
import type { EnrolledRange } from "$lib/instructor/enrolled";

// ponytail: bulk-bar spring animation dropped — settled DOM identical.
const RANGE_LABELS: Record<EnrolledRange, string> = {
  today: "Today",
  ay: "This AY",
  all: "All",
};

export default function EnrolledTab({
  entries,
  total,
  loading,
  range,
  q,
  hasNextPage = false,
  selectedIds = new Set<string>(),
  onrangechange,
  onqchange,
  onloadmore,
  onrevert,
  onselect,
  onselectall,
  onclearselection,
  onbulkrevert,
}: {
  entries: EnrolledEntry[];
  total: number;
  loading: boolean;
  range: EnrolledRange;
  q: string;
  hasNextPage?: boolean;
  selectedIds?: Set<string>;
  onrangechange: (range: EnrolledRange) => void;
  onqchange: (q: string) => void;
  onloadmore: () => void;
  onrevert: (entry: EnrolledEntry) => void;
  onselect?: (id: string) => void;
  onselectall?: (checked: boolean) => void;
  onclearselection?: () => void;
  onbulkrevert?: () => void;
}) {
  const [searchInput, setSearchInput] = useState(q);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setSearchInput(q);
  }, [q]);

  useEffect(() => {
    return () => {
      if (searchTimeout.current) clearTimeout(searchTimeout.current);
    };
  }, []);

  function onSearchInput(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.currentTarget.value;
    setSearchInput(val);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => onqchange(val), 300);
  }

  const selectedCount = selectedIds.size;
  const allVisibleSelected =
    entries.length > 0 && entries.every((e) => selectedIds.has(e.enrollmentId));
  const someVisibleSelected = entries.some((e) =>
    selectedIds.has(e.enrollmentId),
  );
  const selectAllRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (selectAllRef.current)
      selectAllRef.current.indeterminate =
        someVisibleSelected && !allVisibleSelected;
  }, [someVisibleSelected, allVisibleSelected]);

  function formatDate(iso: string) {
    if (!iso) return "";
    try {
      return new Date(iso).toLocaleString("en-PH", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      });
    } catch {
      return iso;
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div
          className="flex rounded-xl border border-border bg-surface p-0.5"
          role="group"
          aria-label="Date range"
        >
          {(["today", "ay", "all"] as EnrolledRange[]).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => onrangechange(r)}
              aria-pressed={range === r}
              className={`rounded-lg px-3 py-1 text-sm transition-colors ${range === r ? "bg-primary font-medium text-white shadow-sm" : "text-muted hover:text-ink"}`}
            >
              {RANGE_LABELS[r]}
            </button>
          ))}
        </div>
        <div className="relative flex-1 min-w-[160px] max-w-xs">
          <svg
            className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="M21 21l-4.35-4.35" strokeLinecap="round" />
          </svg>
          <input
            type="search"
            value={searchInput}
            onChange={onSearchInput}
            placeholder="Search name or student #"
            aria-label="Search enrolled students"
            className="w-full rounded-xl border border-border bg-surface py-1.5 pl-8 pr-3 text-sm text-ink placeholder:text-muted/60 focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </div>
        <span className="ml-auto shrink-0 text-sm text-muted tabular-nums">
          {loading ? "Loading…" : `${total} enrolled`}
        </span>
      </div>

      {entries.length === 0 && !loading ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-border bg-surface-raised py-12 text-center">
          <svg
            className="mb-3 h-8 w-8 text-muted/40"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            aria-hidden="true"
          >
            <path
              d="M9 12l2 2 4-4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <circle cx="12" cy="12" r="9" />
          </svg>
          <p className="text-sm font-medium text-muted">
            {q ? "No results found" : "No enrollments yet"}
          </p>
          <p className="mt-1 text-xs text-muted/60">
            {q
              ? "Try a different name or student number."
              : "Completed enrollments appear here. Reverted enrollments return to the queue at #1."}
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border bg-surface-raised">
          <table className="w-full text-sm" aria-label="Enrolled students">
            <thead>
              <tr className="border-b border-border">
                <th scope="col" className="w-10 px-4 py-2">
                  <input
                    type="checkbox"
                    ref={selectAllRef}
                    checked={allVisibleSelected}
                    onChange={() => onselectall?.(!allVisibleSelected)}
                    aria-label="Select all visible enrolled students"
                    className="h-4 w-4 accent-primary"
                  />
                </th>
                <th
                  scope="col"
                  className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted"
                >
                  Student
                </th>
                <th
                  scope="col"
                  className="hidden px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted sm:table-cell"
                >
                  Student #
                </th>
                <th
                  scope="col"
                  className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted"
                >
                  Enrolled
                </th>
                <th
                  scope="col"
                  className="hidden px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted md:table-cell"
                >
                  Served by
                </th>
                <th
                  scope="col"
                  className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-muted"
                >
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {entries.map((entry) => {
                const checked = selectedIds.has(entry.enrollmentId);
                return (
                  <tr
                    key={entry.enrollmentId}
                    className={`group hover:bg-surface/50 ${checked ? "bg-primary/5" : ""}`}
                  >
                    <td className="px-4 py-2">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => onselect?.(entry.enrollmentId)}
                        aria-label={`Select ${entry.studentName}`}
                        className="h-4 w-4 accent-primary"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-medium text-ink">
                        {entry.studentName}
                      </span>
                    </td>
                    <td className="hidden px-4 py-3 tabular-nums text-muted sm:table-cell">
                      {entry.studentNumber ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className="text-muted"
                        title={formatDate(entry.completedAt)}
                        aria-label={`Enrolled ${relativeTime(entry.completedAt)}`}
                      >
                        {relativeTime(entry.completedAt)}
                      </span>
                    </td>
                    <td className="hidden px-4 py-3 text-muted md:table-cell">
                      {entry.servedByName || "—"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => onrevert(entry)}
                        className="press rounded-lg px-2.5 py-1 text-xs text-error opacity-0 transition-opacity hover:bg-error/10 focus-visible:opacity-100 group-hover:opacity-100"
                        aria-label={`Revert enrollment for ${entry.studentName}`}
                      >
                        Revert
                      </button>
                    </td>
                  </tr>
                );
              })}
              {loading &&
                [0, 1].map((i) => (
                  <tr
                    key={i}
                    className="border-t border-border"
                    aria-hidden="true"
                  >
                    <td className="px-4 py-2">
                      <Skeleton h="1rem" w="1rem" radius="0.25rem" />
                    </td>
                    <td className="px-4 py-3">
                      <Skeleton h="0.875rem" w="9rem" radius="0.25rem" />
                    </td>
                    <td className="hidden px-4 py-3 sm:table-cell">
                      <Skeleton h="0.875rem" w="6rem" radius="0.25rem" />
                    </td>
                    <td className="px-4 py-3">
                      <Skeleton h="0.875rem" w="5rem" radius="0.25rem" />
                    </td>
                    <td className="hidden px-4 py-3 md:table-cell">
                      <Skeleton h="0.875rem" w="7rem" radius="0.25rem" />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Skeleton
                        h="1.5rem"
                        w="3.75rem"
                        radius="0.5rem"
                        className="ml-auto"
                      />
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}

      {selectedCount > 0 && (
        <div className="pointer-events-none fixed bottom-6 left-1/2 z-40 flex -translate-x-1/2 justify-center px-4">
          <div className="pointer-events-auto flex items-center gap-3 rounded-2xl border border-border bg-surface-raised px-4 py-3 shadow-lg">
            <span
              className="text-sm font-medium tabular-nums tracking-tight text-ink"
              style={{ letterSpacing: "-0.01em" }}
            >
              {selectedCount} selected
            </span>
            <div className="h-4 w-px bg-border/60" />
            <button
              type="button"
              onClick={() => onclearselection?.()}
              className="press rounded-lg px-2.5 py-1.5 text-sm text-muted hover:text-ink hover:bg-black/5"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={() => onbulkrevert?.()}
              className="press rounded-xl bg-error px-4 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-error/90"
              aria-label={`Revert ${selectedCount} enrollments`}
            >
              Revert {selectedCount}
            </button>
          </div>
        </div>
      )}

      {hasNextPage && !loading && (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={onloadmore}
            className="press rounded-xl border border-border px-4 py-2 text-sm text-muted hover:text-ink"
          >
            Load more
          </button>
        </div>
      )}
    </div>
  );
}
