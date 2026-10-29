import { useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { api } from "$lib/api";
import { notify } from "$lib/notifications";
import { copyText } from "$lib/clipboard";
import type { DepartmentQueue } from "$lib/instructor/types";
import ModalShell from "../ui/ModalShell";

export default function ShareQueueModal({
  open,
  department,
  anchorRect = null,
  onclose,
}: {
  open: boolean;
  department: DepartmentQueue | null;
  anchorRect?: DOMRect | null;
  onclose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mint = useMutation(api.instructor.mintQueueShareLink.mutationOptions());

  useEffect(() => {
    if (!open || !department) return;
    setCopied(false);
    if (copiedTimer.current) clearTimeout(copiedTimer.current);
    mint.mutate({ departmentId: department.id });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, department?.id]);

  useEffect(() => {
    return () => {
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
    };
  }, []);

  if (!open || !department) return null;

  const url = (mint.data as { url?: string } | undefined)?.url ?? "";
  const subtitle = `${department?.name ?? ""}${department?.code ? ` · ${department.code}` : ""}`;
  const mintError = mint.error
    ? ((mint.error as { message?: string }).message ?? null)
    : null;
  const canNativeShare = (() => {
    if (typeof navigator === "undefined" || !url) return false;
    const nav = navigator as unknown as
      | {
          share?: (d: { url: string }) => Promise<void>;
          canShare?: (d: { url: string }) => boolean;
        }
      | undefined;
    if (!nav?.share) return false;
    if (nav.canShare && !nav.canShare({ url })) return false;
    return true;
  })();

  async function handleCopy() {
    if (!url) return;
    const ok = await copyText(url);
    if (ok) {
      setCopied(true);
      notify.success("Link copied");
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
      copiedTimer.current = setTimeout(() => setCopied(false), 2000);
    } else {
      notify.error(`Could not copy link. Copy manually: ${url}`);
    }
  }

  async function handleNativeShare() {
    if (!url || !department) return;
    const ok = await copyText(url);
    if (ok) notify.success("Link copied");
    const nav = globalThis.navigator as unknown as
      | {
          share?: (d: {
            title?: string;
            text?: string;
            url: string;
          }) => Promise<void>;
        }
      | undefined;
    if (!nav?.share) {
      if (!ok) notify.error(`Could not copy link. Copy manually: ${url}`);
      return;
    }
    try {
      await nav.share({
        title: "BukSU Enrollment Queue",
        text: `Join the ${department.name} enrollment queue — shared by ${(mint.data as { inviterName?: string } | undefined)?.inviterName ?? "your adviser"}.`,
        url,
      });
    } catch (e) {
      if ((e as { name?: string })?.name === "AbortError") return;
    }
  }

  return (
    <ModalShell
      open={open}
      labelledby="share-modal-title"
      describedby="share-modal-desc"
      title="Share queue link"
      subtitle={subtitle}
      anchorRect={anchorRect}
      onclose={onclose}
      footer={
        <>
          <div className="mt-4 flex gap-2 px-5 pb-5">
            <button
              type="button"
              onClick={handleCopy}
              disabled={!url}
              className="press flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-[transform,background-color] duration-100 ease-out hover:bg-primary/90 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-50"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                aria-hidden="true"
              >
                <rect x="9" y="9" width="11" height="11" rx="2" />
                <path d="M15 9V7a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2" />
              </svg>
              Copy link
            </button>
            {canNativeShare && (
              <button
                type="button"
                onClick={handleNativeShare}
                className="press inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-white px-4 py-2.5 text-sm font-medium text-ink shadow-sm transition-[transform,background-color] duration-100 ease-out hover:bg-surface active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  aria-hidden="true"
                >
                  <circle cx="18" cy="5" r="2.2" />
                  <circle cx="18" cy="19" r="2.2" />
                  <circle cx="6" cy="12" r="2.2" />
                  <path d="M8.3 10.7 15.7 6.4" />
                  <path d="M8.3 13.3 15.7 17.6" />
                </svg>
                Share…
              </button>
            )}
          </div>
          <div className="border-t border-border/60 bg-surface/60 px-5 py-3">
            <p className="flex items-center gap-1.5 text-xs text-muted">
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                aria-hidden="true"
              >
                <circle cx="12" cy="12" r="9" />
                <path d="M12 8v4" />
                <path d="M12 16h.01" />
              </svg>
              This link works for the current academic year only.
            </p>
          </div>
        </>
      }
    >
      <div className="px-5">
        {mintError ? (
          <div
            className="rounded-xl border border-error/25 bg-error/5 px-3 py-2.5 text-sm text-error"
            role="alert"
          >
            {mintError}
          </div>
        ) : (
          <div className="group flex items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2.5 shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-[border-color,box-shadow] focus-within:border-primary/30 focus-within:shadow-[0_0_0_3px_rgba(0,64,128,0.08)]">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              className="shrink-0 text-muted"
              aria-hidden="true"
            >
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
            </svg>
            {url ? (
              <>
                <input
                  readOnly
                  value={url}
                  aria-label="Queue link"
                  onClick={(e) =>
                    (e.currentTarget as HTMLInputElement).select()
                  }
                  className="min-w-0 flex-1 truncate bg-transparent text-sm tabular-nums text-ink selection:bg-primary/20 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={handleCopy}
                  aria-label={copied ? "Copied" : "Copy link"}
                  data-modal-initial-focus
                  className={`press inline-flex h-7 shrink-0 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium transition-[transform,background-color,border-color,color] duration-100 ease-out focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${copied ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-border bg-white text-ink hover:bg-surface active:scale-[0.97]"}`}
                >
                  {copied ? (
                    <>
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        aria-hidden="true"
                      >
                        <path d="M5 13l4 4L19 7" />
                      </svg>
                      Copied
                    </>
                  ) : (
                    <>
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.6"
                        aria-hidden="true"
                      >
                        <rect x="9" y="9" width="11" height="11" rx="2" />
                        <path d="M15 9V7a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2" />
                      </svg>
                      Copy
                    </>
                  )}
                </button>
              </>
            ) : (
              <span className="min-w-0 flex-1 text-sm text-muted">
                Creating link…
              </span>
            )}
          </div>
        )}
        <p
          className="mt-2 text-xs leading-relaxed text-muted"
          id="share-modal-desc"
        >
          Anyone with this link lands on{" "}
          <span className="font-medium text-ink">{department.name}</span> and
          can join directly. The queue must be open to join.
        </p>
      </div>
    </ModalShell>
  );
}
