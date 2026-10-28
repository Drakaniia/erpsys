import { estimatedPosition, type ShareLanding } from "$lib/student/queue-share";
import ModalShell from "../ui/ModalShell";

export default function QueueShareModal({
  open,
  landing,
  busy = false,
  onjoin,
  onclose,
}: {
  open: boolean;
  landing: Extract<ShareLanding, { kind: "show" }> | null;
  busy?: boolean;
  onjoin: () => void;
  onclose: () => void;
}) {
  const data = landing?.data ?? null;
  const isSwitch = landing?.variant === "switch";
  const isClosed = landing?.variant === "closed";
  const current = landing?.current ?? null;
  const estimate = data ? estimatedPosition(data.waitingCount) : 0;
  const title = isSwitch
    ? "Switch queues?"
    : `Join the ${data?.departmentName ?? ""} queue`;
  const subtitle = data
    ? `${data.departmentName}${data.departmentCode ? ` · ${data.departmentCode}` : ""}`
    : "";

  if (!open || !landing || !data) return null;

  return (
    <ModalShell
      open={open}
      labelledby="queue-share-title"
      describedby="queue-share-desc"
      title={title}
      subtitle={subtitle}
      onclose={onclose}
      footer={
        <div className="mt-4 flex gap-2 px-5 pb-5">
          <button
            type="button"
            onClick={onclose}
            disabled={busy}
            className="press inline-flex min-w-0 flex-1 items-center justify-center rounded-xl border border-border bg-white px-4 py-2.5 text-sm font-medium text-ink shadow-sm transition-[transform,background-color] duration-100 ease-out hover:bg-surface active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-50"
          >
            <span className="truncate">
              {isSwitch && current
                ? `Stay in ${current.departmentName}`
                : "Not now"}
            </span>
          </button>
          <button
            type="button"
            onClick={onjoin}
            disabled={busy || isClosed}
            data-modal-initial-focus
            className={`press inline-flex min-w-0 flex-1 items-center justify-center rounded-xl px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-[transform,background-color] duration-100 ease-out active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-50 ${isSwitch ? "bg-warning hover:bg-warning/90" : "bg-primary hover:bg-primary/90"}`}
          >
            <span className="truncate">
              {busy
                ? "Joining…"
                : isSwitch && current
                  ? `Leave ${current.departmentName} & join ${data.departmentName}`
                  : `Join ${data.departmentName}`}
            </span>
          </button>
        </div>
      }
    >
      <div className="px-5" id="queue-share-desc">
        {isSwitch && current ? (
          <div className="rounded-xl border border-warning/30 bg-warning/[0.07] px-3.5 py-3 text-sm text-ink">
            <p>
              You&apos;re currently{" "}
              {current.position != null ? (
                <>
                  <span className="font-medium tabular-nums">
                    #{current.position}
                  </span>{" "}
                  in{" "}
                </>
              ) : null}
              <span className="font-medium">{current.departmentName}</span>.
            </p>
            <p className="mt-1 text-muted">
              Joining {data.departmentName} will remove you from that line.
            </p>
          </div>
        ) : (
          <>
            <p className="flex items-center gap-2 text-sm">
              <span
                className={`h-2 w-2 shrink-0 rounded-full ${data.isOpen ? "bg-primary" : "bg-ink/25"}`}
                aria-hidden="true"
              />
              <span className="font-medium text-ink">
                {data.isOpen ? (
                  <>
                    Open
                    {data.openByName ? ` — ${data.openByName} is serving` : ""}
                  </>
                ) : (
                  "Closed"
                )}
              </span>
            </p>

            <p className="mt-3 text-sm text-muted">
              Shared by{" "}
              <span className="font-medium text-ink">
                {data.inviterName ?? "an adviser"}
              </span>
            </p>

            <p className="mt-1.5 text-sm text-muted tabular-nums">
              {data.waitingCount === 0
                ? "Nobody is waiting — you'd be first in line."
                : `${data.waitingCount} waiting · you'd be about #${estimate}`}
            </p>

            {isClosed ? (
              <p className="mt-3 rounded-xl border border-border bg-surface px-3 py-2.5 text-sm text-muted">
                The adviser isn&apos;t accepting students right now. You can
                still browse the departments and come back when it reopens.
              </p>
            ) : null}
          </>
        )}
      </div>
    </ModalShell>
  );
}
