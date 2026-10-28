import { useEffect, useRef, useState } from "react";
import { dialogTrap } from "$lib/ui/dialog-trap";
import { usePresence } from "$lib/ui/use-presence";
import AppleSwitch from "../ui/AppleSwitch";

const STEPS = [
  {
    title: "Your departments are tabs",
    body: "Each tab is a FIFO queue for one department you advise. Switch with 1–N (mapping order). The badge shows waiting count. No Overview — the queue is the page.",
  },
  {
    title: "Serve who\u2019s next",
    body: "The spotlight card is next in line (name, student number, joined time, steps 1–5 verified). Press Serve — exclusive lock — then confirm.",
  },
  {
    title: "Validate, then enroll",
    body: "The confirm dialog restates name, number, Department, Semester AY, and steps 1–5 summary. Enroll is atomic: marks queue done + stamps step 6 VERIFIED — the official enrollment. Keep confirm focused — no extra fields.",
  },
  {
    title: "Control the queue + review enrolled",
    body: "Toggle Accepting students per department — students see Open/Closed. Closing with waiting students asks for confirm. Use Enrolled tab to search/revert (today · AY · all) when needed.",
  },
] as const;

export default function InstructorGuideDialog({
  open,
  step = 1,
  dontShow = true,
  onStepChange,
  onDontShowChange,
  onclose,
}: {
  open: boolean;
  step?: 1 | 2 | 3 | 4;
  dontShow?: boolean;
  onStepChange?: (next: 1 | 2 | 3 | 4) => void;
  onDontShowChange?: (next: boolean) => void;
  onclose: (persist: boolean) => void;
}) {
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3 | 4>(step);
  const [dontShowLocal, setDontShowLocal] = useState(dontShow);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const presence = usePresence(open, {
    fade: true,
    duration: 150,
    outDuration: 150,
  });

  useEffect(() => {
    setCurrentStep(step);
  }, [step]);
  useEffect(() => {
    setDontShowLocal(dontShow);
  }, [dontShow]);

  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    if (!panel) return;
    function guideKeys(event: KeyboardEvent): boolean {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      )
        return false;
      if (event.key === "ArrowRight") {
        event.preventDefault();
        if (currentStep < 4) setStep((currentStep + 1) as 1 | 2 | 3 | 4);
        return true;
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        if (currentStep > 1) setStep((currentStep - 1) as 1 | 2 | 3 | 4);
        return true;
      }
      return false;
    }
    const trap = dialogTrap(panel, {
      onEscape: () => onclose(dontShowLocal),
      onKey: guideKeys,
    });
    return () => trap.destroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, currentStep]);

  function setStep(next: 1 | 2 | 3 | 4) {
    setCurrentStep(next);
    onStepChange?.(next);
  }

  if (!presence.mounted) return null;
  const currentMeta = STEPS[currentStep - 1];

  return (
    <div
      className="modal-scrim fixed inset-0 z-[60] flex items-end justify-center p-4 md:items-center"
      style={{ background: "rgba(0, 0, 0, 0.08)", ...presence.style }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="instructor-guide-title"
      aria-describedby="instructor-guide-body"
      tabIndex={-1}
      onClick={() => onclose(dontShowLocal)}
      onKeyDown={(e) => {
        if (e.key === "Escape") onclose(dontShowLocal);
      }}
    >
      <div
        ref={panelRef}
        className="guide-panel flex w-full max-w-lg flex-col rounded-2xl border border-border bg-surface-raised shadow-xl max-md:max-w-[92vw] max-md:max-h-[86vh] max-md:rounded-t-2xl"
        style={presence.style}
        role="presentation"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 p-6 pb-3">
          <div className="flex-1">
            <p
              className="text-xs font-medium tracking-wide text-muted"
              role="status"
              aria-live="polite"
            >
              Step {currentStep} of 4: {currentMeta.title}
            </p>
            <div
              className="mt-2 flex gap-1.5"
              role="tablist"
              aria-label="Guide steps"
            >
              {([1, 2, 3, 4] as const).map((n) => (
                <button
                  key={n}
                  type="button"
                  role="tab"
                  aria-selected={currentStep === n}
                  aria-label={`Go to step ${n}: ${STEPS[n - 1].title}`}
                  aria-current={currentStep === n ? "step" : undefined}
                  onClick={() => setStep(n)}
                  className={`h-1.5 w-6 rounded-full transition-colors ${currentStep === n ? "bg-primary" : "bg-border hover:bg-muted/40"}`}
                />
              ))}
            </div>
          </div>
          <button
            type="button"
            aria-label="Close guide"
            onClick={() => onclose(dontShowLocal)}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted transition-[transform,background-color,color] duration-100 ease-out hover:bg-surface hover:text-ink active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
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
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-2">
          <h2
            id="instructor-guide-title"
            className="text-base font-semibold tracking-[-0.02em] text-ink"
          >
            {currentMeta.title}
          </h2>
          <p
            id="instructor-guide-body"
            className="mt-2 text-sm leading-relaxed text-muted"
          >
            {currentMeta.body}
          </p>
          {currentStep === 1 && (
            <>
              <div className="mt-4 flex gap-1.5">
                {[1, 2, 3].map((n) => (
                  <span
                    key={n}
                    className={`rounded-full px-3 py-1 text-xs font-medium ${n === 1 ? "bg-primary text-white" : "bg-surface text-muted border border-border"}`}
                  >
                    Dept {n}
                    {n === 1 && (
                      <span className="ml-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-white/20 px-1 text-[10px] tabular-nums">
                        3
                      </span>
                    )}
                  </span>
                ))}
              </div>
              <div className="mt-4 flex items-center gap-2 text-xs">
                <kbd className="rounded border border-border bg-surface px-1.5 py-0.5 font-mono text-[11px] leading-none text-ink">
                  1
                </kbd>
                <span className="text-muted">–</span>
                <kbd className="rounded border border-border bg-surface px-1.5 py-0.5 font-mono text-[11px] leading-none text-ink">
                  N
                </kbd>
                <span className="text-muted">→ Switch department</span>
              </div>
              <p className="mt-2 text-xs text-muted">
                Tip:{" "}
                <kbd className="rounded border border-border bg-surface px-1 py-0.5 font-mono text-[11px]">
                  1
                </kbd>{" "}
                always goes to your first department.
              </p>
            </>
          )}
          {currentStep === 2 && (
            <>
              <div className="mt-4 rounded-xl border border-border bg-surface p-3">
                <p className="text-[11px] font-medium tracking-wide text-primary">
                  Next in line
                </p>
                <p className="mt-1 text-sm font-medium text-ink">
                  J. Dela Cruz
                </p>
                <p className="text-xs tabular-nums text-muted">
                  2021-01234 · Joined 12m ago
                </p>
                <p className="mt-2 inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                  Verified ✓
                </p>
              </div>
              <div className="mt-4 grid gap-1.5 text-xs">
                <div className="flex items-center gap-2">
                  <kbd className="rounded border border-border bg-surface px-1.5 py-0.5 font-mono text-[11px]">
                    S
                  </kbd>
                  <span className="text-muted">→ Serve next student</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="flex gap-1">
                    <kbd className="rounded border border-border bg-surface px-1.5 py-0.5 font-mono text-[11px]">
                      J
                    </kbd>
                    <kbd className="rounded border border-border bg-surface px-1.5 py-0.5 font-mono text-[11px]">
                      K
                    </kbd>
                  </span>
                  <span className="text-muted">/ ↑↓ → Move through list</span>
                </div>
                <div className="flex items-center gap-2">
                  <kbd className="rounded border border-border bg-surface px-1.5 py-0.5 font-mono text-[11px]">
                    Enter
                  </kbd>
                  <span className="text-muted">→ Serve highlighted row</span>
                </div>
              </div>
              <p className="mt-2 text-xs text-muted">
                Strict FIFO — you can only serve #1.
              </p>
            </>
          )}
          {currentStep === 3 && (
            <>
              <div className="mt-4 rounded-xl border border-border bg-surface p-3">
                <div className="flex justify-end gap-2">
                  <span className="rounded-lg px-3 py-1.5 text-xs text-muted">
                    Cancel
                  </span>
                  <span className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-white">
                    Enroll
                  </span>
                </div>
                <p className="mt-2 text-xs text-muted">Enrollment is final.</p>
              </div>
              <div className="mt-4 flex items-center gap-2 text-xs">
                <kbd className="rounded border border-border bg-surface px-1.5 py-0.5 font-mono text-[11px]">
                  Esc
                </kbd>
                <span className="text-muted">
                  → Close dialog (also backdrop click)
                </span>
              </div>
            </>
          )}
          {currentStep === 4 && (
            <div className="mt-4 space-y-3">
              <div className="flex items-center justify-between rounded-xl border border-border bg-surface px-3 py-2">
                <span className="text-xs font-medium text-ink">
                  Accepting students
                </span>
                <AppleSwitch checked interactive={false} size="sm" />
              </div>
              <div className="flex gap-1 rounded-xl border border-border bg-surface p-0.5 w-fit text-xs">
                <span className="rounded-lg bg-surface-raised px-3 py-1 font-medium text-ink shadow-sm">
                  Queue
                </span>
                <span className="px-3 py-1 text-muted">Enrolled</span>
              </div>
            </div>
          )}
        </div>
        <div className="border-t border-border/60 p-6 pt-4">
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() =>
                currentStep > 1 && setStep((currentStep - 1) as 1 | 2 | 3 | 4)
              }
              disabled={currentStep === 1}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition-[transform,background-color] duration-100 ease-out active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${currentStep === 1 ? "text-muted/40 cursor-not-allowed" : "text-muted hover:text-ink hover:bg-surface"}`}
            >
              Back
            </button>
            {currentStep < 4 ? (
              <button
                type="button"
                onClick={() => setStep((currentStep + 1) as 1 | 2 | 3 | 4)}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition-transform duration-100 ease-out active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              >
                Next
              </button>
            ) : (
              <button
                type="button"
                onClick={() => onclose(dontShowLocal)}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition-transform duration-100 ease-out active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              >
                Got it
              </button>
            )}
          </div>
          <label className="mt-4 flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={dontShowLocal}
              onChange={(e) => {
                const next = e.currentTarget.checked;
                setDontShowLocal(next);
                onDontShowChange?.(next);
              }}
              className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
            />
            <span className="text-sm text-muted">Don&apos;t show again</span>
          </label>
          <p className="mt-3 text-xs leading-relaxed text-muted">
            Press{" "}
            <kbd className="rounded border border-border bg-surface px-1 py-0.5 font-mono text-[11px]">
              ?
            </kbd>{" "}
            anytime to see shortcuts · Reopen this guide from the help icon or
            profile menu.
          </p>
        </div>
      </div>
    </div>
  );
}
