import { useRef, useState } from "react";
import { departmentLevelRangeLabel } from "$lib/domain/constants";
import type { DepartmentQueue } from "$lib/instructor/types";
import AvailabilitySwitch from "./AvailabilitySwitch";
import ScheduleDialog from "./ScheduleDialog";
import ShareQueueModal from "./ShareQueueModal";

export default function DeptTabHeader({
  department,
  busy = false,
  refreshing = false,
  hasActiveYear = true,
  onrefresh,
  onavailabilitychange,
}: {
  department: DepartmentQueue;
  busy?: boolean;
  refreshing?: boolean;
  hasActiveYear?: boolean;
  onrefresh: () => void;
  onavailabilitychange: (next: boolean) => void;
}) {
  const myRange = departmentLevelRangeLabel(
    department.myYearLevels.length > 0
      ? department.myYearLevels
      : department.yearLevels,
  );
  const shareDisabled = !department.myOpen;
  const shareHidden = !hasActiveYear || !department;

  const [shareOpen, setShareOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [shareAnchorRect, setShareAnchorRect] = useState<DOMRect | null>(null);
  const shareBtnRef = useRef<HTMLButtonElement | null>(null);

  function openShareModal() {
    if (shareDisabled) return;
    if (shareBtnRef.current)
      setShareAnchorRect(shareBtnRef.current.getBoundingClientRect());
    setShareOpen(true);
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <p className="flex items-center gap-2 text-sm">
          <span
            className={`h-2 w-2 rounded-full ${department.isOpen ? "bg-primary" : "bg-muted"}`}
            aria-hidden="true"
          />
          <span className="font-medium text-ink">
            {department.isOpen ? "Open" : "Closed"}
          </span>
          <span className="text-muted tabular-nums">
            {department.waitingCount} waiting
          </span>
          <span className="text-muted" aria-hidden="true">
            ·
          </span>
          <span
            className="text-muted"
            title="The year levels assigned to you in this department"
          >
            Your levels: {myRange}
          </span>
        </p>
        <div className="ml-auto flex items-center gap-3">
          {hasActiveYear && (
            <button
              type="button"
              onClick={() => setScheduleOpen(true)}
              aria-haspopup="dialog"
              className="press rounded-lg px-2 py-1.5 text-sm text-muted transition-[transform,color] duration-100 ease-out hover:text-ink active:scale-[0.97]"
            >
              Schedule
            </button>
          )}
          {!shareHidden && (
            <span
              className="inline-flex"
              title={shareDisabled ? "Open queue to share" : "Share queue link"}
            >
              <button
                type="button"
                ref={shareBtnRef}
                onClick={openShareModal}
                disabled={shareDisabled}
                aria-label={
                  shareDisabled ? "Open queue to share" : "Share queue link"
                }
                aria-disabled={shareDisabled}
                aria-haspopup="dialog"
                aria-expanded={shareOpen}
                className="press flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:text-ink active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40"
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <circle cx="18" cy="5" r="2.5" />
                  <circle cx="18" cy="19" r="2.5" />
                  <circle cx="6" cy="12" r="2.5" />
                  <path d="M8.2 10.7 15.8 6.3" />
                  <path d="M8.2 13.3 15.8 17.7" />
                </svg>
              </button>
            </span>
          )}
          <AvailabilitySwitch
            checked={department.myOpen}
            colleagueName={
              department.myOpen ? null : (department.openBy?.name ?? null)
            }
            busy={busy}
            onchange={onavailabilitychange}
          />
          <button
            type="button"
            onClick={onrefresh}
            disabled={refreshing}
            aria-label="Refresh queue"
            aria-busy={refreshing ? "true" : undefined}
            className="press rounded-lg p-1.5 text-muted transition-[transform,color] duration-100 ease-out hover:text-ink disabled:opacity-60"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
              className={
                refreshing ? "animate-spin motion-reduce:animate-none" : ""
              }
            >
              <path d="M21 12a9 9 0 1 1-2.64-6.36" />
              <path d="M21 3v6h-6" />
            </svg>
          </button>
        </div>
      </div>
      <ScheduleDialog
        open={scheduleOpen}
        department={{ id: department.id, name: department.name }}
        onclose={() => setScheduleOpen(false)}
      />
      <ShareQueueModal
        open={shareOpen}
        department={department}
        anchorRect={shareAnchorRect}
        onclose={() => setShareOpen(false)}
      />
    </>
  );
}
