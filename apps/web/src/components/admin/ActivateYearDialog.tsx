import { useEffect, useRef } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { dialogTrap } from "$lib/ui/dialog-trap";
import { api } from "$lib/api";
import type { AcademicYearItem } from "$lib/admin/types";
import SkeletonText from "../ui/SkeletonText";

export default function ActivateYearDialog({
  year,
  ontoast,
  onactivated,
  onclose,
}: {
  year: AcademicYearItem | null;
  ontoast: (message: string, kind?: "success" | "error") => void;
  onactivated: () => void;
  onclose: () => void;
}) {
  const panelRef = useRef<HTMLDivElement | null>(null);

  const previewQuery = useQuery(
    api.admin.getActivationPreview.queryOptions({
      input: { yearId: year?.id ?? "" },
      enabled: year !== null,
    }),
  );

  const activateMutation = useMutation(
    api.admin.activateAcademicYear.mutationOptions(),
  );

  useEffect(() => {
    if (!year) return;
    const panel = panelRef.current;
    if (!panel) return;
    const trap = dialogTrap(panel, { onEscape: onclose });
    return () => trap.destroy();
  }, [year, onclose]);

  if (!year) return null;

  async function confirmActivate() {
    if (!year) return;
    try {
      await activateMutation.mutateAsync({ yearId: year.id });
      ontoast(`${year.label} · ${year.semesterLabel} is now active`);
      onactivated();
      onclose();
    } catch (e) {
      ontoast(
        e instanceof Error ? e.message : "Could not activate year",
        "error",
      );
      onclose();
    }
  }

  const studentsWithProgress = previewQuery.data?.studentsWithProgress;
  const openQueueCount = previewQuery.data?.openQueueCount ?? 0;
  const currentLabel = previewQuery.data?.currentYearLabel;
  const activationBlocked = openQueueCount > 0;

  return (
    <div
      className="modal-scrim fixed inset-0 z-50 flex items-center justify-center p-4"
      tabIndex={-1}
      style={{ background: "rgba(0, 0, 0, 0.08)" }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="activate-year-title"
      onClick={onclose}
      onKeyDown={(e) => {
        if (e.key === "Escape") onclose();
      }}
    >
      <div
        ref={panelRef}
        className="w-full max-w-md rounded-2xl bg-surface-raised p-5 shadow-xl"
        role="presentation"
        onClick={(e) => e.stopPropagation()}
      >
        <h2
          id="activate-year-title"
          className="text-base font-semibold text-ink"
        >
          Activate {year.label} · {year.semesterLabel}?
        </h2>

        <div className="mt-3 space-y-2 rounded-xl border border-border bg-surface p-4">
          {previewQuery.isPending ? (
            <SkeletonText lines={3} />
          ) : (
            <>
              {currentLabel ? (
                <p className="text-sm text-ink">
                  <span className="font-semibold tabular-nums">
                    {studentsWithProgress?.toLocaleString() ?? "…"}
                  </span>
                  <span className="text-muted">
                    {" "}
                    student{studentsWithProgress === 1 ? " has" : "s have"}{" "}
                    progress in {currentLabel} — they redo steps 1–6 in the new
                    year.
                  </span>
                </p>
              ) : (
                <p className="text-sm text-ink">
                  No previous active year — starting fresh.
                </p>
              )}
              <p className="text-sm text-muted">
                Previous years' stamps remain in records (archived).
              </p>
              {activationBlocked && (
                <p className="rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm font-medium text-ink">
                  {openQueueCount} student
                  {openQueueCount === 1 ? " is" : "s are"} still in line in{" "}
                  {currentLabel} — finish serving them before switching years.
                </p>
              )}
            </>
          )}
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onclose}
            disabled={activateMutation.isPending}
            className="rounded-lg px-3 py-1.5 text-sm text-muted transition-[transform,background-color] duration-100 ease-out hover:text-ink active:scale-[0.97] disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={confirmActivate}
            disabled={
              activateMutation.isPending ||
              previewQuery.isPending ||
              activationBlocked
            }
            title={
              activationBlocked
                ? "Students are still in line in the current year"
                : undefined
            }
            className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-white transition-[transform,background-color] duration-100 ease-out active:scale-[0.97] disabled:opacity-50"
          >
            {activateMutation.isPending
              ? "Activating…"
              : activationBlocked
                ? "Finish current queues first"
                : "Activate year"}
          </button>
        </div>
      </div>
    </div>
  );
}
