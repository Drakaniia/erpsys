export default function QueueStatusCard({
  position,
  departmentName,
  status,
  deptOpen,
  servesMyLevel,
  adviserName,
  busy,
  onleave,
}: {
  position: number | null;
  departmentName: string;
  status: string;
  deptOpen: boolean;
  servesMyLevel: boolean;
  adviserName: string | null;
  busy: boolean;
  onleave: () => void;
}) {
  const who = adviserName?.trim() ? adviserName.trim() : null;

  let statusLine: string;
  if (status === "IN_PROGRESS") {
    statusLine = who
      ? `${who} is serving you now.`
      : "The adviser is serving you now.";
  } else if (status === "WAITING") {
    statusLine = who
      ? `${who} is managing this queue — we'll let you know when it's your turn.`
      : "Waiting — we'll notify you when the adviser is ready.";
  } else {
    statusLine = who ? `Served by ${who}.` : "Enrollment complete.";
  }

  const stalled = status === "WAITING" && deptOpen && !servesMyLevel;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col items-center gap-2 rounded-2xl border border-border bg-surface px-4 py-10 text-center">
        <p className="text-[44px] font-bold leading-none tabular-nums text-primary">
          #{position ?? "—"}
        </p>
        <p className="text-[15px] font-semibold text-ink">{departmentName}</p>
      </div>
      {stalled ? (
        <div
          className="rounded-2xl border border-warning/25 bg-warning/10 px-4 py-3"
          aria-live="polite"
        >
          <p className="text-center text-sm text-ink">
            No adviser here is assigned your year level yet, so nobody can call
            you forward. You keep your place — you&apos;ll be served as soon as
            one is on duty.
          </p>
        </div>
      ) : status === "WAITING" && !deptOpen ? (
        <div
          className="rounded-2xl border border-muted/20 bg-muted/5 px-4 py-3"
          aria-live="polite"
        >
          <p className="text-center text-sm text-muted">
            The queue is temporarily closed — you are still in line.{" "}
            {who
              ? `${who} will reopen it soon.`
              : "The adviser will reopen it soon."}
          </p>
        </div>
      ) : null}
      <div className="rounded-2xl border border-border bg-surface-raised px-4 py-3.5">
        <p className="text-center text-sm text-muted" aria-live="polite">
          {statusLine}
        </p>
      </div>
      {status === "WAITING" ? (
        <button
          type="button"
          onClick={onleave}
          disabled={busy}
          className="mt-1 text-center text-sm text-muted underline-offset-2 hover:text-error hover:underline disabled:opacity-50"
        >
          Leave the queue
        </button>
      ) : null}
    </div>
  );
}
