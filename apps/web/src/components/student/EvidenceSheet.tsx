import { useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import EvidenceLightbox from "./EvidenceLightbox";
import EvidenceSlot from "./EvidenceSlot";
import ReplyNotice from "./ReplyNotice";
import StampDisplay from "./StampDisplay";
import SubmittedNotice from "./SubmittedNotice";
import { api, queryClient } from "$lib/api";
import type { StepCode, StepRow } from "$lib/student/types";

type EvidenceStep = Extract<
  StepCode,
  "SOCIAL_MEDIA" | "PROFILING" | "MUGSHOT" | "CONSENT"
>;

function getVerifiedBadge(url: string): string {
  try {
    const h = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
    if (h === "drive.google.com") return "drive.google.com";
    if (h === "storage.to" || h.endsWith(".storage.to")) return "storage.to";
    return h;
  } catch {
    return "";
  }
}

export default function EvidenceSheet({
  step,
  slotLabel,
  slotHint,
  multiple = false,
  bodyNote,
  notify,
}: {
  step: StepRow;
  slotLabel: string;
  slotHint?: string;
  multiple?: boolean;
  bodyNote?: string;
  notify: (message: string, kind?: "success" | "error") => void;
}) {
  const uploadMutation = useMutation(
    api.student.uploadEvidence.mutationOptions(),
  );
  const deleteMutation = useMutation(
    api.student.deleteEvidence.mutationOptions(),
  );
  const submitMutation = useMutation(
    api.student.submitEvidence.mutationOptions(),
  );
  const upsertLinkMutation = useMutation(
    api.student.upsertExternalLink.mutationOptions(),
  );
  const removeLinkMutation = useMutation(
    api.student.removeExternalLink.mutationOptions(),
  );

  const locked = step.status === "VERIFIED";
  const [lightboxIndex, setLightboxIndex] = useState(-1);
  const [removedIds, setRemovedIds] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const queuedUpload = useRef<(() => Promise<void>) | null>(null);
  const [hasQueuedUpload, setHasQueuedUpload] = useState(false);

  const stepEvidence = (step.evidence as any[]) ?? [];
  const visibleEvidence = stepEvidence.filter(
    (e) => !removedIds.has(String(e.id)),
  );
  const hasLiveEvidence = visibleEvidence.some((e) => !e.expired);

  const cameraEnabled = step.code === "MUGSHOT" || step.code === "CONSENT";
  const verifiedExternalLink =
    (step.evidence as any[]).find((e) => e.kind === "EXTERNAL_LINK") ?? null;
  const images = visibleEvidence.filter(
    (e) => e.kind !== "EXTERNAL_LINK" && !e.expired,
  );

  async function submit() {
    if (submitting) return;
    setSubmitting(true);
    try {
      if (queuedUpload.current) await queuedUpload.current();
      await submitMutation.mutateAsync({ stepCode: step.code as EvidenceStep });
      queryClient.invalidateQueries({ queryKey: ["student"] });
      notify("Submitted — pending officer review.");
    } catch (e) {
      // An upload can land before the submit fails; refetch so the drafts it
      // created still count as evidence instead of vanishing from the sheet.
      queryClient.invalidateQueries({ queryKey: ["student"] });
      notify(
        (e as { message?: string })?.message ?? "Could not submit — try again.",
        "error",
      );
    } finally {
      setSubmitting(false);
    }
  }

  function queueUpload(run: (() => Promise<void>) | null) {
    queuedUpload.current = run;
    setHasQueuedUpload(Boolean(run));
  }

  async function upload(fileKey: string, fileUrl: string) {
    if (fileKey.startsWith("r2:")) return;
    await uploadMutation.mutateAsync({
      stepCode: step.code as EvidenceStep,
      fileKey,
      fileUrl,
    });
  }

  function remove(uploadId: string) {
    setRemovedIds((prev) => {
      const next = new Set(prev);
      next.add(uploadId);
      return next;
    });
    notify("Attachment removed");
    const task = (async () => {
      try {
        await deleteMutation.mutateAsync({ uploadId });
        queryClient.invalidateQueries({ queryKey: ["student"] });
      } catch (e) {
        setRemovedIds((prev) => {
          const next = new Set(prev);
          next.delete(uploadId);
          return next;
        });
        notify(
          (e as { message?: string })?.message ??
            "Could not remove the upload.",
          "error",
        );
      }
    })();
    void task;
  }

  async function upsertLink(url: string) {
    try {
      await upsertLinkMutation.mutateAsync({
        stepCode: step.code as EvidenceStep,
        url,
      });
      queryClient.invalidateQueries({ queryKey: ["student"] });
      notify("Attached successfully");
    } catch (e) {
      const msg =
        (e as { message?: string })?.message ?? "Could not save link.";
      notify(msg, "error");
      throw e;
    }
  }

  async function removeLink() {
    try {
      await removeLinkMutation.mutateAsync({
        stepCode: step.code as EvidenceStep,
      });
      queryClient.invalidateQueries({ queryKey: ["student"] });
      notify("Attachment removed");
    } catch (e) {
      notify(
        (e as { message?: string })?.message ?? "Could not remove link.",
        "error",
      );
    }
  }

  return (
    <>
      <div className="flex flex-col gap-4">
        {step.reply ? <ReplyNotice reply={step.reply} /> : null}

        {step.status === "VERIFIED" ? (
          <>
            {step.stamp ? (
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
            )}
            <div className="mt-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
                Submitted evidence
              </p>
              <EvidenceSlot
                items={step.evidence}
                multiple={multiple}
                locked
                label=""
                uploading={false}
                onupload={async () => {}}
                ondelete={() => {}}
                onpreview={(i) => setLightboxIndex(i)}
                stepCode={step.code}
                cameraEnabled={false}
              />
              {verifiedExternalLink ? (
                <div className="mt-3 flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2">
                  <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                    {getVerifiedBadge(verifiedExternalLink.fileUrl)}
                  </span>
                  <a
                    href={verifiedExternalLink.fileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="min-w-0 flex-1 truncate text-sm text-primary hover:underline"
                  >
                    Open
                  </a>
                </div>
              ) : null}
            </div>
          </>
        ) : step.status === "SUBMITTED" ? (
          <SubmittedNotice
            stepCode={step.code as EvidenceStep}
            evidence={step.evidence}
            notify={notify}
          />
        ) : (
          <>
            {step.code === "SOCIAL_MEDIA" ? (
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
                  Like & follow these pages
                </p>
                {step.socialMediaLinks && step.socialMediaLinks.length > 0 ? (
                  <>
                    <ul className="space-y-1.5">
                      {step.socialMediaLinks.map(
                        (link: { id: string; url: string; name: string }) => (
                          <li key={link.id}>
                            <a
                              href={link.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-2.5 rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-ink hover:border-primary/40"
                            >
                              <svg
                                width="14"
                                height="14"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="1.5"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                aria-hidden="true"
                                className="shrink-0 text-primary/60"
                              >
                                <path d="M20 6 9 17l-5-5" />
                              </svg>
                              <span className="min-w-0 flex-1 truncate">
                                {link.name}
                              </span>
                              <svg
                                width="14"
                                height="14"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                aria-hidden="true"
                                className="shrink-0 text-muted/50"
                              >
                                <path d="M7 17 17 7" />
                                <path d="M7 7h10v10" />
                              </svg>
                            </a>
                          </li>
                        ),
                      )}
                    </ul>
                    <p className="mt-2 text-xs text-muted">
                      Like and follow ALL pages before submitting.
                    </p>
                  </>
                ) : (
                  <p className="rounded-xl border border-border bg-surface px-3 py-2.5 text-sm text-muted">
                    Pages not yet listed — see the SBO office.
                  </p>
                )}
              </div>
            ) : null}
            {bodyNote ? <p className="text-sm text-muted">{bodyNote}</p> : null}
            <EvidenceSlot
              items={visibleEvidence}
              multiple={multiple}
              locked={locked}
              label={slotLabel}
              hint={slotHint}
              uploading={submitting}
              onupload={upload}
              ondelete={remove}
              onpreview={(i) => setLightboxIndex(i)}
              onqueue={queueUpload}
              stepCode={step.code}
              cameraEnabled={cameraEnabled}
              onUpsertLink={upsertLink}
              onRemoveLink={removeLink}
              linkBusy={
                upsertLinkMutation.isPending || removeLinkMutation.isPending
              }
            />
            {hasLiveEvidence || hasQueuedUpload || submitting ? (
              <div className="lg:sticky lg:bottom-0 lg:z-10">
                <div className="lg:-mx-5 lg:bg-gradient-to-b lg:from-transparent lg:to-surface-raised lg:px-5 lg:pb-3 lg:pt-3">
                  <button
                    type="button"
                    onClick={submit}
                    disabled={submitting}
                    aria-busy={submitting}
                    className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary text-[15px] font-semibold text-white disabled:opacity-50"
                  >
                    {submitting ? (
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
                    {submitting ? "Submitting…" : "Submit for review"}
                  </button>
                </div>
              </div>
            ) : null}
          </>
        )}
      </div>

      {lightboxIndex >= 0 && step.evidence.length > 0 ? (
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
