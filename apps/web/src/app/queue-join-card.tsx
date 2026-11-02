import {
  YEAR_LEVEL_LABELS,
  departmentLevelRangeLabel,
} from "$lib/domain/constants";
import { scheduleLine } from "$lib/student/schedule";
import Skeleton from "../components/ui/Skeleton";

export function JoinCard({
  myDept,
  myDeptPending,
  myDeptError,
  needsRecord,
  closed,
  unserved,
  readyForQueue,
  missing,
  canJoin,
  joining,
  joinError,
  shareNotice,
  onJoin,
  onGotoStudent,
}: {
  myDept: any;
  myDeptPending: boolean;
  myDeptError: boolean;
  needsRecord: boolean;
  closed: boolean;
  unserved: boolean;
  readyForQueue: boolean;
  missing: string[];
  canJoin: boolean;
  joining: boolean;
  joinError: string | null;
  shareNotice: string | null;
  onJoin: () => void;
  onGotoStudent: () => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-2xl border border-border bg-surface px-4 py-4">
        <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted">
          Your queue
        </p>
        <p className="mt-1 text-[17px] font-semibold text-ink">
          {myDept?.departmentName}
        </p>
        <p className="mt-0.5 text-sm text-muted">
          {myDept
            ? YEAR_LEVEL_LABELS[
                myDept.myYearLevel as keyof typeof YEAR_LEVEL_LABELS
              ]
            : ""}{" "}
          · {myDept?.waitingCount ?? 0} waiting
        </p>
        {myDept && !closed ? (
          <p className="mt-1 text-sm text-muted">
            {scheduleLine(myDept.schedule)}
          </p>
        ) : null}
        {myDept?.isOpen && myDept.openBy ? (
          <p className="mt-2 flex items-center gap-1.5 text-sm text-primary">
            <span
              aria-hidden="true"
              className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary"
            ></span>
            Open — {myDept.openBy.name}
          </p>
        ) : null}
      </div>

      {myDeptPending ? (
        <div
          className="rounded-2xl border border-border bg-surface p-4"
          aria-hidden="true"
        >
          <Skeleton h="0.9375rem" w="40%" radius="0.25rem" />
          <Skeleton h="0.75rem" w="25%" radius="0.25rem" />
        </div>
      ) : myDeptError ? (
        <p className="rounded-xl border border-border bg-surface px-3 py-2.5 text-sm text-muted">
          Couldn&apos;t load your queue — try again shortly.
        </p>
      ) : needsRecord ? (
        <div className="rounded-2xl border border-border bg-surface p-4">
          <p className="text-sm font-semibold text-ink">
            Set your course and year level
          </p>
          <p className="mt-1 text-sm text-muted">
            Your enrollment record for this year is missing, so there&apos;s no
            queue to join yet.
          </p>
          <button
            type="button"
            onClick={onGotoStudent}
            className="mt-3 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white transition-transform duration-100 ease-out active:scale-[0.98]"
          >
            Go to my progress
          </button>
        </div>
      ) : closed ? (
        <div className="rounded-2xl border border-border bg-surface p-4">
          <p className="text-sm font-semibold text-ink">The queue is closed</p>
          <p className="mt-1 text-sm text-muted">
            No adviser is accepting students in {myDept?.departmentName} right
            now. Come back when the office announces it&apos;s open.
          </p>
          <p className="mt-1 text-sm text-muted">
            {scheduleLine(myDept?.schedule)}
          </p>
        </div>
      ) : unserved ? (
        <div className="rounded-2xl border border-warning/25 bg-warning/10 p-4">
          <p className="text-sm font-semibold text-ink">
            Nobody on duty serves your year yet
          </p>
          <p className="mt-1 text-sm text-ink">
            {myDept && myDept.openLevels.length > 0
              ? `The advisers on duty cover ${departmentLevelRangeLabel(myDept.openLevels).toLowerCase()}, not ${(YEAR_LEVEL_LABELS[myDept.myYearLevel as keyof typeof YEAR_LEVEL_LABELS] ?? "").toLowerCase()}.`
              : "No adviser on duty has set which year levels they serve."}
          </p>
          <button
            type="button"
            onClick={onGotoStudent}
            className="mt-3 rounded-xl border border-primary/30 bg-white px-4 py-2.5 text-sm font-semibold text-primary transition-transform duration-100 ease-out active:scale-[0.98]"
          >
            Change my year level
          </button>
        </div>
      ) : !readyForQueue ? (
        <div className="rounded-2xl border border-border bg-surface p-4">
          <p className="text-sm font-semibold text-ink">
            You must complete first:
          </p>
          <ul className="mt-2 space-y-1.5">
            {missing.map((m) => (
              <li className="flex items-start gap-2 text-sm text-muted" key={m}>
                <span
                  aria-hidden="true"
                  className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-warning"
                ></span>
                {m}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="group relative">
          <button
            type="button"
            onClick={onJoin}
            disabled={!canJoin || joining}
            className="flex h-12 w-full items-center justify-center rounded-xl bg-primary text-[15px] font-semibold text-white transition-[transform,background-color] duration-100 ease-out active:scale-[0.97] disabled:opacity-50"
          >
            {joining ? "Joining…" : "Join queue"}
          </button>
        </div>
      )}
      {joinError ? (
        <p
          className="rounded-xl border border-error/25 bg-error/5 px-3 py-2.5 text-sm text-error"
          aria-live="polite"
        >
          {joinError}
        </p>
      ) : null}
      {shareNotice ? (
        <p className="px-1 text-sm text-muted">{shareNotice}</p>
      ) : null}
    </div>
  );
}
