import { useEffect, useState } from "react";
import type { QueueEntry } from "$lib/instructor/types";
import WaitingRow from "./WaitingRow";
import QueuePagination from "./QueuePagination";

// ponytail: flip-list + fade animations dropped — settled DOM identical.
const ITEMS_PER_PAGE = 10;

export default function QueueListPanel({
  entries,
  selectedId,
  serveId = null,
  busy = false,
  deptOpen = true,
  removingId = null,
  onserve,
  onremove,
}: {
  entries: QueueEntry[];
  selectedId: string | null;
  /** The one entry I may serve now (first in my year levels), if any. */
  serveId?: string | null;
  busy?: boolean;
  deptOpen?: boolean;
  removingId?: string | null;
  onserve?: (entry: QueueEntry) => void;
  onremove?: (entry: QueueEntry) => void;
}) {
  const [currentPage, setCurrentPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(entries.length / ITEMS_PER_PAGE));

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  // Keep the keyboard-highlighted row on screen.
  useEffect(() => {
    const index = entries.findIndex((e) => e.entryId === selectedId);
    if (index >= 0) setCurrentPage(Math.floor(index / ITEMS_PER_PAGE) + 1);
    // Only when the highlight moves — not on every poll.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const endIndex = Math.min(startIndex + ITEMS_PER_PAGE, entries.length);
  const visibleEntries = entries.slice(startIndex, endIndex);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-1 pb-3">
        <h3 className="text-sm font-medium text-muted">
          {entries.length} {entries.length === 1 ? "student" : "students"}{" "}
          waiting
        </h3>
      </div>
      {entries.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center rounded-2xl border border-border bg-surface-raised py-12 text-center">
          <svg
            className="mb-3 h-8 w-8 text-primary"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            aria-hidden="true"
          >
            <path
              d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 010 3.75H5.625a1.875 1.875 0 010-3.75z"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <p className="text-sm font-medium text-muted">Queue empty</p>
          <p className="mt-1 text-xs text-muted/60">
            No students waiting in line
          </p>
        </div>
      ) : (
        <>
          <div className="flex-1 overflow-hidden rounded-2xl border border-border bg-surface-raised">
            <ul
              className="divide-y divide-border"
              aria-label="Waiting students"
            >
              {visibleEntries.map((entry, i) => (
                <li key={entry.entryId} className="list-none overflow-hidden">
                  <WaitingRow
                    entry={entry}
                    position={startIndex + i + 1}
                    selected={selectedId === entry.entryId}
                    canServe={entry.entryId === serveId}
                    busy={busy}
                    deptOpen={deptOpen}
                    removing={removingId === entry.entryId}
                    onserve={() => onserve?.(entry)}
                    onremove={onremove ? (e) => onremove(e) : undefined}
                  />
                </li>
              ))}
            </ul>
          </div>
          <div className="mt-3">
            <QueuePagination
              currentPage={currentPage}
              totalPages={totalPages}
              onPageChange={setCurrentPage}
            />
          </div>
        </>
      )}
    </div>
  );
}
