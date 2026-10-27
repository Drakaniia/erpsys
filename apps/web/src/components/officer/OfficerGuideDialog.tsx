import { useEffect, useState } from "react";
import { dialogTrap } from "$lib/ui/dialog-trap";
import { usePresence } from "$lib/ui/use-presence";
import { STEPS } from "./officer-guide-steps";
import GuideStepVisuals from "./GuideStepVisuals";

type GuideStepNum = 1 | 2 | 3 | 4 | 5 | 6;

// ponytail: svelte fade/slide transitions dropped — settled DOM identical.
export default function OfficerGuideDialog({
  open,
  step = 1,
  dontShow = true,
  onStepChange,
  onDontShowChange,
  onclose,
}: {
  open: boolean;
  step?: GuideStepNum;
  dontShow?: boolean;
  onStepChange?: (next: GuideStepNum) => void;
  onDontShowChange?: (next: boolean) => void;
  onclose: (persist: boolean) => void;
}) {
  const [currentStep, setCurrentStep] = useState<GuideStepNum>(step);
  const [dontShowLocal, setDontShowLocal] = useState(dontShow);
  const [panelEl, setPanelEl] = useState<HTMLDivElement | null>(null);

  useEffect(() => {
    setCurrentStep(step);
  }, [step]);
  useEffect(() => {
    setDontShowLocal(dontShow);
  }, [dontShow]);

  const presence = usePresence(open, {
    fade: true,
    duration: 150,
    outDuration: 150,
  });

  useEffect(() => {
    if (!presence.mounted || !panelEl) return;
    const trap = dialogTrap(panelEl, {
      onEscape: () => onclose(dontShowLocal),
      onKey: (event) => {
        const target = event.target as HTMLElement | null;
        if (
          target &&
          (target.tagName === "INPUT" ||
            target.tagName === "TEXTAREA" ||
            target.isContentEditable)
        ) {
          return false;
        }
        if (event.key === "ArrowRight") {
          event.preventDefault();
          setCurrentStep((prev) => {
            const next = Math.min(6, prev + 1) as GuideStepNum;
            if (next !== prev) onStepChange?.(next);
            return next;
          });
          return true;
        }
        if (event.key === "ArrowLeft") {
          event.preventDefault();
          setCurrentStep((prev) => {
            const next = Math.max(1, prev - 1) as GuideStepNum;
            if (next !== prev) onStepChange?.(next);
            return next;
          });
          return true;
        }
        return false;
      },
    });
    return () => trap.destroy();
  }, [presence.mounted, panelEl, onclose, dontShowLocal, onStepChange]);

  function setStep(next: GuideStepNum) {
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
      aria-labelledby="officer-guide-title"
      aria-describedby="officer-guide-body"
      tabIndex={-1}
      onClick={() => onclose(dontShowLocal)}
      onKeyDown={(e) => {
        if (e.key === "Escape") onclose(dontShowLocal);
      }}
    >
      <div
        ref={setPanelEl}
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
              Step {currentStep} of 6: {currentMeta.title}
            </p>
            <div
              className="mt-2 flex gap-1.5"
              role="tablist"
              aria-label="Guide steps"
            >
              {([1, 2, 3, 4, 5, 6] as const).map((n) => (
                <button
                  key={n}
                  type="button"
                  role="tab"
                  aria-selected={currentStep === n}
                  aria-label={`Go to step ${n}: ${STEPS[n - 1].title}`}
                  aria-current={currentStep === n ? "step" : undefined}
                  onClick={() => setStep(n)}
                  className={`h-1.5 w-6 rounded-full transition-colors ${currentStep === n ? "bg-primary" : "bg-border hover:bg-muted/40"}`}
                ></button>
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
            id="officer-guide-title"
            className="text-base font-semibold tracking-[-0.02em] text-ink"
          >
            {currentMeta.title}
          </h2>
          <p
            id="officer-guide-body"
            className="mt-2 text-sm leading-relaxed text-muted"
          >
            {currentMeta.body}
          </p>
          <GuideStepVisuals step={currentStep} />
        </div>
        <div className="border-t border-border/60 p-6 pt-4">
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() =>
                currentStep > 1 && setStep((currentStep - 1) as GuideStepNum)
              }
              disabled={currentStep === 1}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition-[transform,background-color] duration-100 ease-out active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
                currentStep === 1
                  ? "text-muted/40 cursor-not-allowed"
                  : "text-muted hover:text-ink hover:bg-surface"
              }`}
            >
              Back
            </button>
            {currentStep < 6 ? (
              <button
                type="button"
                onClick={() => setStep((currentStep + 1) as GuideStepNum)}
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
            anytime to see shortcuts · Reopen this guide from the help icon.
          </p>
        </div>
      </div>
    </div>
  );
}
