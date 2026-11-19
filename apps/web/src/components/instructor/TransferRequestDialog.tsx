import { useEffect, useRef } from "react";
import {
  departmentLevelRangeLabel,
  type YearLevel,
} from "$lib/domain/constants";
import { dialogTrap } from "$lib/ui/dialog-trap";
import { usePresence } from "$lib/ui/use-presence";

export default function TransferRequestDialog({
  open,
  requesterName,
  departmentCode,
  departmentName,
  yearLevels = [],
  expiresAt,
  busy = false,
  onaccept,
  ondecline,
}: {
  open: boolean;
  requesterName: string;
  departmentCode: string;
  departmentName: string;
  yearLevels?: YearLevel[];
  expiresAt: string;
  busy?: boolean;
  onaccept: () => void;
  ondecline: () => void;
}) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const presence = usePresence(open, {
    fade: true,
    duration: 150,
    outDuration: 150,
  });

  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    if (!panel) return;
    const trap = dialogTrap(panel, {});
    return () => trap.destroy();
  }, [open]);

  if (!presence.mounted) return null;

  const scopeLabel =
    yearLevels.length > 0
      ? departmentLevelRangeLabel(yearLevels)
      : "the whole department";
  const deadline = (() => {
    if (!expiresAt) return "";
    const at = new Date(expiresAt);
    if (Number.isNaN(at.getTime())) return "";
    return at.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  })();

  return (
    <div
      className="modal-scrim fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0, 0, 0, 0.08)", ...presence.style }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="transfer-request-title"
    >
      <div
        ref={panelRef}
        className="w-full max-w-sm rounded-2xl bg-surface-raised p-5 shadow-xl"
        style={presence.style}
        role="presentation"
        tabIndex={-1}
      >
        <h2
          id="transfer-request-title"
          className="text-base font-semibold text-ink"
        >
          Transfer request
        </h2>
        <p className="mt-1 text-sm text-muted">
          <span className="font-medium text-ink">{requesterName}</span> wants to
          take over <span className="font-medium text-ink">{scopeLabel}</span>{" "}
          of the <span className="font-medium text-ink">{departmentCode}</span>{" "}
          ({departmentName}) queue.
        </p>
        {yearLevels.length > 0 && (
          <p className="mt-1 text-xs text-muted">
            You keep the other year levels you serve here.
          </p>
        )}
        {deadline && (
          <p className="mt-1 text-xs text-muted">
            If you don&apos;t respond by {deadline}, the queue transfers
            automatically.
          </p>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={ondecline}
            disabled={busy}
            className="rounded-lg px-3 py-1.5 text-sm text-muted transition-[transform,background-color] duration-100 ease-out hover:text-ink active:scale-[0.97] disabled:opacity-50"
          >
            Decline
          </button>
          <button
            type="button"
            onClick={onaccept}
            disabled={busy}
            className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-white transition-[transform,background-color] duration-100 ease-out active:scale-[0.97] disabled:opacity-50"
          >
            {busy ? "Working…" : "Accept transfer"}
          </button>
        </div>
      </div>
    </div>
  );
}
