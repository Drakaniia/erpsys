import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import ReplyNotice from "./ReplyNotice";
import StampDisplay from "./StampDisplay";
import { api, queryClient } from "$lib/api";
import type { StepRow } from "$lib/student/types";

export default function AssessmentSheet({
  step,
  notify,
}: {
  step: StepRow;
  notify: (message: string, kind?: "success" | "error") => void;
}) {
  const applyMutation = useMutation(
    api.student.applyAssessment.mutationOptions(),
  );
  const busy = applyMutation.isPending;

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);

  async function apply() {
    setApplyError(null);
    try {
      await applyMutation.mutateAsync({});
      setConfirmOpen(false);
      queryClient.invalidateQueries({ queryKey: ["student"] });
      notify("Application received — awaiting officer review");
    } catch (e) {
      const message =
        (e as { message?: string }).message ??
        "Could not apply — please try again.";
      setApplyError(message);
      notify(message, "error");
    }
  }

  return (
    <>
      <div className="flex flex-col gap-4">
        {step.reply ? <ReplyNotice reply={step.reply} /> : null}

        {step.status === "VERIFIED" ? (
          step.stamp ? (
            <StampDisplay
              stampName={step.stamp.stampName ?? step.stamp.verifiedByName}
              stampGraphicUrl={step.stamp.stampGraphicUrl}
              stampSignatureUrl={step.stamp.stampSignatureUrl}
              verifiedAt={step.stamp.verifiedAt}
              verifiedByName={step.stamp.verifiedByName}
            />
          ) : (
            <p className="rounded-2xl border border-border bg-surface px-4 py-10 text-center text-[15px] font-semibold text-ink">
              Verified — you&apos;re done with this step.
            </p>
          )
        ) : step.status === "APPLIED" ? (
          <div className="flex flex-col items-center gap-2 rounded-2xl border border-border bg-surface px-4 py-10 text-center">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <circle cx="12" cy="12" r="10" />
                <path d="M12 6v6l4 2" />
              </svg>
            </span>
            <p className="text-[15px] font-semibold text-ink">
              Application received
            </p>
            <p className="max-w-[240px] text-sm text-muted">
              Awaiting officer review — check your notifications.
            </p>
          </div>
        ) : (
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
              Requirements & payments
            </p>
            <ol className="space-y-2">
              {(step.requirements ?? []).map(
                (req: { id: string; label: string }, i: number) => (
                  <li
                    key={req.id}
                    className="flex items-start gap-2.5 rounded-xl border border-border bg-surface px-3 py-2.5"
                  >
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold tabular-nums text-primary">
                      {i + 1}
                    </span>
                    <span className="text-sm text-ink">{req.label}</span>
                  </li>
                ),
              )}
              {(step.requirements ?? []).length === 0 ? (
                <li className="rounded-xl border border-border bg-surface px-3 py-2.5 text-sm text-muted">
                  No requirements listed yet.
                </li>
              ) : null}
            </ol>
            <button
              type="button"
              onClick={() => setConfirmOpen(true)}
              disabled={busy}
              className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary text-[15px] font-semibold text-white transition-transform duration-100 ease-out active:scale-[0.98] disabled:opacity-60"
            >
              {busy ? (
                <svg
                  className="animate-spin"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  aria-hidden="true"
                >
                  <path d="M21 12a9 9 0 1 1-6.22-8.56" />
                </svg>
              ) : null}
              {busy
                ? "Applying…"
                : step.status === "RETURNED"
                  ? "Apply again"
                  : "Apply for assessment"}
            </button>
          </div>
        )}
      </div>

      {confirmOpen ? (
        <div
          className="modal-scrim fixed inset-0 z-[70] flex items-center justify-center p-4"
          style={{ background: "rgba(0, 0, 0, 0.08)" }}
          role="presentation"
          onClick={() => setConfirmOpen(false)}
          onKeyDown={(e) => {
            if (e.key === "Escape" || e.key === "Enter" || e.key === " ") {
              e.stopPropagation();
              setConfirmOpen(false);
            }
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Confirm assessment application"
            tabIndex={-1}
            className="w-full max-w-sm rounded-2xl border border-border bg-surface-raised p-5 shadow-[0_16px_40px_rgba(0,0,0,0.12),0_4px_12px_rgba(0,0,0,0.06)]"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold tracking-tight text-ink">
              Apply for assessment?
            </h3>
            <p className="mt-1 text-sm text-muted">
              An SBO officer checks your SIMS balance before stamping.
            </p>
            <ul className="mt-3 space-y-1.5">
              {(step.requirements ?? []).map(
                (req: { id: string; label: string }) => (
                  <li
                    key={req.id}
                    className="flex items-start gap-2 text-sm text-ink"
                  >
                    <span
                      aria-hidden="true"
                      className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary"
                    />
                    {req.label}
                  </li>
                ),
              )}
            </ul>
            {applyError ? (
              <p
                className="mt-3 rounded-lg border border-error/25 bg-error/5 px-3 py-2 text-xs text-error"
                role="alert"
              >
                {applyError}
              </p>
            ) : null}
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                className="flex h-11 flex-1 items-center justify-center rounded-xl border border-border bg-surface text-sm font-semibold text-ink transition-[transform,background-color] duration-100 ease-out active:scale-[0.97]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={apply}
                disabled={busy}
                className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-primary text-sm font-semibold text-white transition-transform duration-100 ease-out active:scale-[0.97] disabled:opacity-60"
              >
                {busy ? (
                  <svg
                    className="animate-spin"
                    width="15"
                    height="15"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    aria-hidden="true"
                  >
                    <path d="M21 12a9 9 0 1 1-6.22-8.56" />
                  </svg>
                ) : null}
                {busy ? "Applying…" : "Apply"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
