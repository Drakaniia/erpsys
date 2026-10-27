import { useEffect, useRef, useState } from "react";
import DetailSheetMain from "./DetailSheetMain";
import EvidenceLightbox from "./EvidenceLightbox";
import Skeleton from "../ui/Skeleton";
import { useDetailSheetState } from "$lib/officer/detail-sheet";
import { trapTabKey } from "$lib/officer/detail-handlers";
import { authClient } from "$lib/auth-client";

// ponytail: svelte spring enter/exit + drag-to-dismiss dropped — the sheet
// renders statically at full width. The settled DOM is identical; add the
// motion back when motion polish is scheduled for this surface.
export default function DetailSheet({
  verificationId,
  onclose,
  onmarkread,
}: {
  verificationId: string | null;
  onclose: () => void;
  onmarkread: (id: string) => void;
}) {
  const sessionQuery = authClient.useSession();
  const officerName =
    (sessionQuery.data?.user as { name?: string } | undefined)?.name ?? "";
  const officerNameRef = useRef(officerName);
  officerNameRef.current = officerName;

  const ds = useDetailSheetState(
    () => verificationId,
    () => officerNameRef.current,
  );

  const [mounted, setMounted] = useState(false);
  const lastOpenedId = useRef<string | null>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const oncloseRef = useRef(onclose);
  oncloseRef.current = onclose;
  const onmarkreadRef = useRef(onmarkread);
  onmarkreadRef.current = onmarkread;

  useEffect(() => {
    const id = verificationId;
    if (id) {
      if (id !== lastOpenedId.current) {
        lastOpenedId.current = id;
        setMounted(true);
        ds.resetLocal();
        onmarkreadRef.current(id);
        const prev = document.activeElement as HTMLElement | null;
        if (prev && prev !== document.body) previouslyFocused.current = prev;
        requestAnimationFrame(() => panelRef.current?.focus());
      }
    } else {
      lastOpenedId.current = null;
      if (mounted) {
        setMounted(false);
        oncloseRef.current();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [verificationId]);

  useEffect(() => {
    if (!mounted) {
      previouslyFocused.current?.focus?.();
      previouslyFocused.current = null;
    }
  }, [mounted]);

  const canStamp = ds.canStamp;
  const stampOpen = ds.stampOpen;
  const replyOpen = ds.replyOpen;
  const revokeOpen = ds.revokeOpen;
  const lightboxIndex = ds.lightboxIndex;

  useEffect(() => {
    if (!mounted) return;
    const onKeydown = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      if (e.key === "Escape") {
        e.preventDefault();
        if (lightboxIndex >= 0) ds.setLightboxIndex(-1);
        else if (replyOpen) ds.setReplyOpen(false);
        else oncloseRef.current();
        return;
      }
      const t = e.target as HTMLElement | null;
      const typing =
        t &&
        (t.tagName === "INPUT" ||
          t.tagName === "TEXTAREA" ||
          t.isContentEditable);
      if (
        (e.key === "s" || e.key === "S") &&
        !typing &&
        canStamp &&
        !stampOpen &&
        !replyOpen &&
        !revokeOpen &&
        lightboxIndex < 0
      ) {
        e.preventDefault();
        ds.setStampOpen(true);
        return;
      }
      if (
        e.key === "Tab" &&
        panelRef.current &&
        !stampOpen &&
        !revokeOpen &&
        lightboxIndex < 0
      )
        trapTabKey(e, panelRef.current);
    };
    window.addEventListener("keydown", onKeydown);
    return () => window.removeEventListener("keydown", onKeydown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted, canStamp, stampOpen, replyOpen, revokeOpen, lightboxIndex]);

  if (!mounted) return null;

  const evidenceImages = (
    (ds.data?.evidence ?? []) as Array<{
      kind: string;
      fileUrl: string;
      id: string;
      fileKey?: string | null;
      mime?: string | null;
      name?: string | null;
    }>
  ).filter((e) => e.kind !== "EXTERNAL_LINK");

  return (
    <>
      <div
        className="modal-scrim fixed inset-0 z-50"
        style={{ background: "rgba(0, 0, 0, 0.08)" }}
        aria-hidden="true"
        onClick={() => onclose()}
      ></div>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={
          ds.student
            ? `${ds.student.name} — ${ds.step?.name ?? "step"} detail`
            : "Submission detail"
        }
        tabIndex={-1}
        className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[520px] flex-col border-l border-border bg-surface-raised shadow-[-16px_0_40px_rgba(0,0,0,0.12),-4px_0_12px_rgba(0,0,0,0.06)] outline-none touch-pan-y"
      >
        <div
          data-sheet-drag-handle
          className="flex h-2 shrink-0 items-center justify-center pt-1"
          aria-hidden="true"
        >
          <div className="h-1 w-8 rounded-full bg-border/60"></div>
        </div>
        {ds.detailQuery.isPending && !ds.data ? (
          <div className="px-5 py-4" aria-hidden="true">
            <div className="flex items-start gap-3 border-b border-border pb-4">
              <Skeleton h="2.5rem" w="2.5rem" radius="999px" />
              <div className="min-w-0 flex-1">
                <Skeleton h="1.375rem" w="45%" radius="0.375rem" />
                <Skeleton
                  h="0.875rem"
                  w="7rem"
                  radius="0.25rem"
                  className="mt-2"
                />
                <div className="mt-2.5 flex items-center gap-2">
                  <Skeleton h="0.875rem" w="9rem" radius="0.25rem" />
                  <Skeleton h="1.375rem" w="5.5rem" radius="999px" />
                </div>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton
                  key={i}
                  h="9rem"
                  radius="0.75rem"
                  index={i + 1}
                  className="aspect-4/3"
                />
              ))}
            </div>
            <div className="mt-4 space-y-2">
              <Skeleton h="0.75rem" w="30%" radius="0.25rem" />
              <Skeleton h="5rem" w="100%" radius="0.75rem" />
            </div>
          </div>
        ) : ds.detailQuery.isError && !ds.data ? (
          <div className="mx-5 mt-4 rounded-lg border border-border bg-surface p-4 text-sm text-muted">
            Could not load this submission.
            <button
              type="button"
              className="ml-2 text-primary hover:underline"
              onClick={() => ds.detailQuery.refetch()}
            >
              Retry
            </button>
          </div>
        ) : ds.data ? (
          <DetailSheetMain
            data={ds.data}
            status={ds.status}
            reply={ds.effectiveReply}
            stamp={ds.effectiveStamp}
            revocation={ds.effectiveRevocation}
            replyOpen={ds.replyOpen}
            replyBusy={ds.replyMutation.isPending}
            captureBusy={ds.captureMutation.isPending}
            captureDismissed={ds.captureDismissed}
            isVerified={ds.isVerified}
            busyAny={ds.busyAny}
            sendBackLabel={ds.sendBackLabel}
            revokeBusy={ds.revokeMutation.isPending}
            onclose={() => onclose()}
            onopenlightbox={(i) => ds.setLightboxIndex(i)}
            oncapturesave={ds.handleCaptureSave}
            oncapturecancel={() => ds.setCaptureDismissed(true)}
            onshowcamera={() => ds.setCaptureDismissed(false)}
            onreplyclose={() => ds.setReplyOpen(false)}
            onreplysend={ds.handleReply}
            onstamp={() => ds.setStampOpen(true)}
            onrevoke={() => ds.setRevokeOpen(true)}
            ontogglesendback={() => ds.setReplyOpen(!ds.replyOpen)}
            justVerified={ds.justVerified}
            dialogStampName={ds.dialogStampName}
            dialogGraphicUrl={
              (ds.stampQuery.data as { graphicUrl?: string | null } | undefined)
                ?.graphicUrl ?? null
            }
            dialogSignatureUrl={
              (
                ds.stampQuery.data as
                  | { signatureUrl?: string | null }
                  | undefined
              )?.signatureUrl ?? null
            }
            dateLabel={ds.dateLabel}
            stampOpen={ds.stampOpen}
            revokeOpen={ds.revokeOpen}
            studentName={ds.student?.name ?? ""}
            verifyBusy={ds.verifyMutation.isPending}
            onconfirm={ds.handleVerify}
            oncancel={() => ds.setStampOpen(false)}
            onrevokeconfirm={ds.handleRevoke}
            onrevokecancel={() => ds.setRevokeOpen(false)}
            onfinish={() => ds.setJustVerified(false)}
          />
        ) : null}
        <p className="sr-only" aria-live="polite">
          {ds.announcement}
        </p>
      </div>
      {ds.lightboxIndex >= 0 && evidenceImages.length > 0 && (
        <EvidenceLightbox
          images={evidenceImages}
          index={ds.lightboxIndex}
          onclose={() => ds.setLightboxIndex(-1)}
          onindexchange={(i) => ds.setLightboxIndex(i)}
        />
      )}
    </>
  );
}
