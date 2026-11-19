import DriveThumb from "../DriveThumb";
import { absoluteTime, initials, relativeTime } from "$lib/officer/format";
import type { ListItem } from "$lib/officer/types";

export default function SubmissionRow({
  item,
  view,
  unread,
  selected = false,
  showEvidence = true,
  onopen,
  onselect,
}: {
  item: ListItem;
  view: "table" | "cards";
  unread: boolean;
  selected?: boolean;
  showEvidence?: boolean;
  onopen: (verificationId: string) => void;
  onselect?: (id: string) => void;
}) {
  function open() {
    onselect?.(item.verificationId);
    onopen(item.verificationId);
  }

  function onKeydown(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      open();
    }
  }

  function avatar() {
    if (item.student.image) {
      return (
        <img
          src={item.student.image}
          alt=""
          loading="lazy"
          className="h-8 w-8 shrink-0 rounded-full object-cover"
        />
      );
    }
    return (
      <span
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-white"
        aria-hidden="true"
      >
        {initials(item.student.name)}
      </span>
    );
  }

  function statusChip() {
    if ((item.status === "PENDING" || item.status === "SUBMITTED") && unread) {
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-primary px-2 py-0.5 text-xs font-medium text-white">
          <span
            className="h-1.5 w-1.5 rounded-full bg-white"
            aria-hidden="true"
          ></span>
          New
        </span>
      );
    }
    if (item.status === "SUBMITTED" || item.status === "PENDING") {
      return (
        <span className="inline-flex items-center rounded-full border border-border bg-surface-raised px-2 py-0.5 text-xs font-medium text-muted">
          Pending
        </span>
      );
    }
    if (item.status === "RETURNED") {
      return (
        <span className="inline-flex items-center rounded-full bg-warning/10 px-2 py-0.5 text-xs font-medium text-warning">
          Returned
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-primary px-2 py-0.5 text-xs font-medium text-primary">
        <svg viewBox="0 0 12 12" className="h-3 w-3" aria-hidden="true">
          <path
            d="M2 6.5 4.5 9 10 3"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        Verified
      </span>
    );
  }

  function thumbs(tile: string, chipTile: string) {
    if (!showEvidence || item.evidence.length === 0) return null;
    return (
      <div className="flex items-center gap-1.5">
        {item.evidence
          .slice(0, 3)
          .map(
            (ev: {
              id: string;
              fileUrl: string;
              fileKey?: string | null;
              mime?: string | null;
              name?: string | null;
            }) => (
              <DriveThumb
                key={ev.id}
                item={ev}
                alt={`Evidence for ${item.student.name}`}
                className={`${tile} rounded-lg border border-border object-cover`}
              />
            ),
          )}
        {item.evidenceCount > item.evidence.length && (
          <span
            className={`inline-flex ${chipTile} items-center justify-center rounded-lg border border-border bg-surface-raised text-xs font-medium tabular-nums text-muted`}
          >
            +{item.evidenceCount - item.evidence.length}
          </span>
        )}
      </div>
    );
  }

  // ponytail: reduced-motion transform override for .card-row lives in the
  // global stylesheet, not a per-component <style> block.
  if (view === "table") {
    return (
      <tr
        data-verification-id={item.verificationId}
        tabIndex={0}
        className={`group h-14 cursor-pointer border-b border-border last:border-0 hover:bg-surface-raised ${selected ? "bg-primary/5" : ""}`}
        onClick={open}
        onKeyDown={onKeydown}
      >
        <td className="px-4">
          <div className="flex items-center gap-2.5">
            <span
              className="flex w-2 shrink-0 justify-center"
              aria-hidden="true"
            >
              {unread && (
                <span className="h-1.5 w-1.5 rounded-full bg-primary"></span>
              )}
            </span>
            {avatar()}
            <span className="flex min-w-0 flex-col">
              <span className="truncate text-sm font-medium text-ink">
                {item.student.name}
              </span>
              {item.student.studentNumber && (
                <span className="truncate text-xs text-muted tabular-nums">
                  {item.student.studentNumber}
                </span>
              )}
            </span>
          </div>
        </td>
        <td className="px-4">
          <span
            className="text-sm text-muted"
            title={absoluteTime(item.submittedAt)}
          >
            {relativeTime(item.submittedAt)}
          </span>
        </td>
        {showEvidence && (
          <td className="px-4">{thumbs("h-14 w-14", "h-14 w-8")}</td>
        )}
        <td className="px-4">{statusChip()}</td>
        <td className="px-4 text-right">
          <button
            onClick={(e) => {
              e.stopPropagation();
              open();
            }}
            className={`text-sm font-medium text-primary group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 ${selected ? "opacity-100" : "opacity-0"}`}
          >
            Review
          </button>
        </td>
      </tr>
    );
  }
  return (
    <div
      data-verification-id={item.verificationId}
      tabIndex={0}
      role="button"
      aria-label={`Review ${item.student.name}`}
      className={`card-row group flex min-h-[96px] cursor-pointer rounded-xl border border-border bg-surface-raised p-4 transition-transform duration-100 ease-out active:scale-[0.98] ${selected ? "bg-primary/5" : ""}`}
      onClick={open}
      onKeyDown={onKeydown}
    >
      <div className="flex w-full flex-col gap-3">
        <div className="flex items-start gap-2.5">
          <span
            className="flex w-2 shrink-0 justify-center pt-2"
            aria-hidden="true"
          >
            {unread && (
              <span className="h-1.5 w-1.5 rounded-full bg-primary"></span>
            )}
          </span>
          {avatar()}
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-sm font-medium text-ink">
              {item.student.name}
            </span>
            <span className="mt-0.5 flex items-baseline gap-1.5 text-xs text-muted">
              {item.student.studentNumber && (
                <span className="tabular-nums">
                  {item.student.studentNumber}
                </span>
              )}
              <span
                className="tabular-nums"
                title={absoluteTime(item.submittedAt)}
              >
                {relativeTime(item.submittedAt)}
              </span>
            </span>
          </span>
          <span className="ml-auto">{statusChip()}</span>
        </div>
        <div className="flex items-end justify-between gap-3">
          {thumbs("h-16 w-16", "h-16 w-10")}
          <button
            onClick={(e) => {
              e.stopPropagation();
              open();
            }}
            className={`text-sm font-medium text-primary group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 ${selected ? "opacity-100" : "opacity-0"}`}
          >
            Review
          </button>
        </div>
      </div>
    </div>
  );
}
