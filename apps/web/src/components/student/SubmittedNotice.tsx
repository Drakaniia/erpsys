import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import EvidenceLightbox from "./EvidenceLightbox";
import EvidenceSlot from "./EvidenceSlot";
import { api, queryClient } from "$lib/api";
import type { StepCode } from "$lib/student/types";

export default function SubmittedNotice({
  stepCode,
  evidence,
  notify,
}: {
  stepCode: Extract<
    StepCode,
    "SOCIAL_MEDIA" | "PROFILING" | "MUGSHOT" | "CONSENT"
  >;
  evidence: Array<{
    id: string;
    fileUrl: string;
    fileKey?: string | null;
    mime?: string | null;
    name?: string | null;
    kind: string;
    expiresAt?: string | null;
    expired?: boolean;
  }>;
  notify: (message: string, kind?: "success" | "error") => void;
}) {
  const cancelMutation = useMutation(
    api.student.cancelEvidenceSubmission.mutationOptions(),
  );
  const busy = cancelMutation.isPending;

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(-1);

  async function cancel() {
    try {
      await cancelMutation.mutateAsync({ stepCode });
      setConfirmOpen(false);
      queryClient.invalidateQueries({ queryKey: ["student"] });
      notify("Submission cancelled — back to draft.");
    } catch (e) {
      notify(
        (e as { message?: string }).message ?? "Could not cancel — try again.",
        "error",
      );
    }
  }

  const images = evidence.filter(
    (e) => e.kind !== "EXTERNAL_LINK" && !e.expired,
  );

  return (
    <>
      <div className="flex flex-col gap-4">
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-border bg-surface px-4 py-8 text-center">
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
            Submitted — awaiting officer review
          </p>
          <p className="max-w-[260px] text-sm text-muted">
            Check your notifications for the officer&apos;s decision.
          </p>
        </div>

        <EvidenceSlot
          items={evidence}
          locked
          label=""
          uploading={false}
          onupload={async () => {}}
          ondelete={() => {}}
          onpreview={(i) => setLightboxIndex(i)}
        />

        <button
          type="button"
          onClick={() => setConfirmOpen(true)}
          disabled={busy}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-border bg-surface text-[15px] font-semibold text-ink transition-colors duration-200 ease-out hover:border-error/40 hover:text-error disabled:opacity-50"
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
          {busy ? "Cancelling…" : "Cancel submission"}
        </button>
        <p className="text-center text-xs text-muted">
          Cancelling hides this step from officers until you submit again. Your
          uploads stay saved.
        </p>
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
            aria-label="Cancel submission"
            tabIndex={-1}
            className="w-full max-w-sm rounded-2xl border border-border bg-surface-raised p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold tracking-tight text-ink">
              Cancel submission?
            </h3>
            <p className="mt-1 text-sm text-muted">
              This step will disappear from the officer&apos;s review list. Your
              uploads stay saved, and you can submit again anytime.
            </p>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                className="flex h-11 flex-1 items-center justify-center rounded-xl border border-border bg-surface text-sm font-semibold text-ink"
              >
                Keep submission
              </button>
              <button
                type="button"
                onClick={cancel}
                disabled={busy}
                className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-error text-sm font-semibold text-white disabled:opacity-60"
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
                {busy ? "Cancelling…" : "Cancel submission"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {lightboxIndex >= 0 && evidence.length > 0 && images.length > 0 ? (
        <EvidenceLightbox
          images={images.map((e) => ({
            id: e.id,
            fileKey: e.fileKey ?? null,
            fileUrl: e.fileUrl,
            mime: e.mime ?? null,
            name: e.name ?? null,
            kind: e.kind,
          }))}
          index={lightboxIndex}
          onclose={() => setLightboxIndex(-1)}
        />
      ) : null}
    </>
  );
}
