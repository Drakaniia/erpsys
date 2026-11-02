import { useEffect, useState } from "react";
import { estimatedPosition, type ShareLanding } from "$lib/student/queue-share";
import AppleCheckbox from "../components/ui/AppleCheckbox";
import ModalShell from "../components/ui/ModalShell";
import { dialogTrap } from "$lib/ui/dialog-trap";
import { usePresence } from "$lib/ui/use-presence";
import { useRef } from "react";

export function QueueStatusCard({
  position,
  departmentName,
  status,
  deptOpen,
  servesMyLevel,
  adviserName,
  busy,
  scheduleText = null,
  onleave,
}: {
  position: number | null;
  departmentName: string;
  status: string;
  deptOpen: boolean;
  servesMyLevel: boolean;
  adviserName: string | null;
  busy: boolean;
  scheduleText?: string | null;
  onleave: () => void;
}) {
  const who = adviserName?.trim() ? adviserName.trim() : null;
  const statusLine =
    status === "IN_PROGRESS"
      ? who
        ? `${who} is serving you now.`
        : "The adviser is serving you now."
      : status === "WAITING"
        ? who
          ? `${who} is managing this queue — we'll let you know when it's your turn.`
          : "Waiting — we'll notify you when the adviser is ready."
        : who
          ? `Served by ${who}.`
          : "Enrollment complete.";
  const stalled = status === "WAITING" && deptOpen && !servesMyLevel;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col items-center gap-2 rounded-2xl border border-border bg-surface px-4 py-10 text-center">
        {position != null ? (
          <p className="text-[44px] font-bold leading-none tabular-nums text-primary">
            #{position}
          </p>
        ) : (
          <p className="text-sm font-medium text-muted" aria-live="polite">
            checking your place…
          </p>
        )}
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
          {scheduleText ? (
            <p className="mt-1 text-center text-sm text-muted">{scheduleText}</p>
          ) : null}
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

export function FacultyConfirmDialog({
  open,
  busy,
  onconfirm,
  onclose,
}: {
  open: boolean;
  busy: boolean;
  onconfirm: () => void;
  onclose: () => void;
}) {
  const [checked, setChecked] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const presence = usePresence(open, {
    fade: true,
    duration: 150,
    outDuration: 150,
  });

  useEffect(() => {
    if (open) setChecked(false);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    if (!panel) return;
    const trap = dialogTrap(panel, { onEscape: onclose });
    return () => trap.destroy();
  }, [open, onclose]);

  if (!presence.mounted) return null;

  return (
    <div
      className="modal-scrim fixed inset-0 z-50 flex items-center justify-center p-4"
      tabIndex={-1}
      style={{ background: "rgba(0, 0, 0, 0.08)", ...presence.style }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="faculty-confirm-title"
      aria-describedby="faculty-confirm-body"
      onClick={onclose}
      onKeyDown={(e) => {
        if (e.key === "Escape") onclose();
      }}
    >
      <div
        ref={panelRef}
        className="w-full max-w-sm rounded-2xl bg-surface-raised p-5 shadow-xl"
        style={presence.style}
        role="presentation"
        onClick={(e) => e.stopPropagation()}
      >
        <h2
          id="faculty-confirm-title"
          className="text-base font-semibold text-ink"
        >
          Confirm you&apos;re at the faculty
        </h2>
        <p id="faculty-confirm-body" className="mt-1 text-sm text-muted">
          Final enrollment happens face-to-face on the 3rd floor. Please confirm
          you are already at the faculty before entering the queue.
        </p>
        <label
          className={`mt-4 flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors ${
            checked
              ? "border-primary/30 bg-primary/5"
              : "border-border bg-surface hover:border-primary/20"
          }`}
        >
          <AppleCheckbox
            checked={checked}
            label="I confirm I am on the 3rd floor faculty"
            onChange={(v) => setChecked(v)}
          />
          <span className="flex-1 text-sm font-medium text-ink">
            I am on the 3rd floor faculty
          </span>
        </label>
        <p className="mt-2 text-xs text-muted">
          You must check this to join — an adviser will serve you in person.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onclose}
            disabled={busy}
            className="rounded-lg px-3 py-1.5 text-sm text-muted transition-[transform,background-color] duration-100 ease-out hover:text-ink active:scale-[0.97] disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              if (!checked || busy) return;
              onconfirm();
              setChecked(false);
            }}
            disabled={!checked || busy}
            className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          >
            {busy ? "Joining…" : "Confirm & Join"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function QueueShareModal({
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
            className={`press inline-flex min-w-0 flex-1 items-center justify-center rounded-xl px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-[transform,background-color] duration-100 ease-out active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
              isSwitch
                ? "bg-warning hover:bg-warning/90"
                : "bg-primary hover:bg-primary/90"
            } disabled:cursor-not-allowed disabled:opacity-50`}
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
              ></span>
              <span className="font-medium text-ink">
                {data.isOpen
                  ? `Open${data.openByName ? ` — ${data.openByName} is serving` : ""}`
                  : "Closed"}
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
