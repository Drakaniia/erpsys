function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded border border-border bg-surface px-1.5 py-0.5 font-mono text-[11px] leading-none text-ink">
      {children}
    </kbd>
  );
}

export default function GuideStepVisuals({
  step,
}: {
  step: 1 | 2 | 3 | 4 | 5 | 6;
}) {
  if (step === 1) {
    return (
      <>
        <div className="mt-4 flex flex-wrap gap-1.5">
          {["Assessment", "Social", "Profiling", "Mugshot", "Consent"].map(
            (tab, i) => (
              <span
                key={tab}
                className={`rounded-full px-3 py-1 text-xs font-medium ${i === 0 ? "bg-primary text-white" : "bg-surface text-muted border border-border"}`}
              >
                {tab}
                {i === 0 && (
                  <span className="ml-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-white/20 px-1 text-[10px] tabular-nums">
                    8
                  </span>
                )}
              </span>
            ),
          )}
        </div>
        <div className="mt-3 flex gap-2">
          <span className="rounded-lg border border-border bg-surface px-3 py-1.5 text-xs text-muted">
            Assessment · 8 unverified
          </span>
          <span className="rounded-lg border border-border bg-surface px-3 py-1.5 text-xs text-muted">
            Social · 3
          </span>
        </div>
        <div className="mt-4 grid gap-1.5 text-xs">
          <div className="flex items-center gap-2">
            <Kbd>1</Kbd>
            <span className="text-muted">–</span>
            <Kbd>5</Kbd>
            <span className="text-muted">→ Assessment → Consent</span>
          </div>
          <div className="flex items-center gap-2">
            <Kbd>0</Kbd>
            <span className="text-muted">/</span>
            <Kbd>H</Kbd>
            <span className="text-muted">→ Overview</span>
          </div>
          <div className="flex items-center gap-2">
            <Kbd>?</Kbd>
            <span className="text-muted">→ Shortcuts popover</span>
          </div>
        </div>
      </>
    );
  }
  if (step === 2) {
    return (
      <>
        <div className="mt-4 rounded-xl border border-border bg-surface p-3">
          <div className="flex items-center gap-2 border-b border-border/60 pb-2 text-[11px] font-medium text-muted">
            <span className="flex-1">Student</span>
            <span className="w-16 text-right">Submitted</span>
            <span className="w-12 text-right">Evidence</span>
            <span className="w-14 text-right">Status</span>
          </div>
          <div className="flex items-center gap-2 py-2 text-xs">
            <span className="flex flex-1 items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-[10px] font-medium text-primary">
                JD
              </span>
              <span className="tabular-nums">2021-01234</span>
            </span>
            <span className="w-16 text-right text-muted">12m ago</span>
            <span className="flex w-12 items-center justify-end gap-0.5">
              <span className="inline-block h-4 w-4 rounded bg-primary/20"></span>
              <span className="inline-block h-4 w-4 rounded bg-primary/20"></span>
              <span className="text-[10px] text-muted">+1</span>
            </span>
            <span className="inline-flex w-14 justify-end">
              <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                New
              </span>
            </span>
          </div>
          <div className="flex items-center gap-2 border-t border-border/60 py-2 text-xs">
            <span className="flex flex-1 items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-muted/10 text-[10px] font-medium text-muted">
                MS
              </span>
              <span className="tabular-nums">2020-05678</span>
            </span>
            <span className="w-16 text-right text-muted">2h ago</span>
            <span className="flex w-12 items-center justify-end gap-0.5">
              <span className="inline-block h-4 w-4 rounded bg-primary/20"></span>
            </span>
            <span className="inline-flex w-14 justify-end">
              <span className="rounded-full bg-muted/10 px-1.5 py-0.5 text-[10px] font-medium text-muted">
                Pending
              </span>
            </span>
          </div>
        </div>
        <div className="mt-3 flex gap-1 rounded-lg border border-border bg-surface p-0.5 w-fit text-xs">
          <span className="rounded-md bg-surface-raised px-2.5 py-1 font-medium text-ink shadow-sm">
            Table
          </span>
          <span className="px-2.5 py-1 text-muted">Cards</span>
        </div>
        <div className="mt-4 grid gap-1.5 text-xs">
          <div className="flex items-center gap-2">
            <span className="flex gap-1">
              <Kbd>J</Kbd>
              <Kbd>K</Kbd>
            </span>
            <span className="text-muted">/ ↑↓ → Move through list</span>
          </div>
          <div className="flex items-center gap-2">
            <Kbd>Enter</Kbd>
            <span className="text-muted">→ Open detail sheet</span>
          </div>
        </div>
        <p className="mt-2 text-xs text-muted">
          Tip: Default sort is oldest first — longest waiting on top.
        </p>
      </>
    );
  }
  if (step === 3) {
    return (
      <>
        <div className="mt-4 rounded-xl border border-border bg-surface p-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-ink">J. Dela Cruz</p>
              <p className="text-[11px] tabular-nums text-muted">
                2021-01234 · Assessment · New
              </p>
            </div>
          </div>
          <div className="mt-2 flex gap-1.5">
            <span className="inline-block h-14 w-14 rounded-lg bg-primary/10"></span>
            <span className="inline-block h-14 w-14 rounded-lg bg-primary/10"></span>
            <span className="inline-block h-14 w-14 rounded-lg bg-primary/10"></span>
            <span className="inline-flex items-center rounded-lg bg-surface-raised px-2 text-[10px] text-muted">
              3 images
            </span>
          </div>
        </div>
        <div className="mt-3 rounded-lg bg-surface-raised/60 px-3 py-2 text-xs text-muted">
          Click a thumbnail → lightbox (zoom, pan) · <Kbd>Esc</Kbd> to close
        </div>
        <div className="mt-4 grid gap-1.5 text-xs">
          <div className="flex items-center gap-2">
            <Kbd>Esc</Kbd>
            <span className="text-muted">
              → Close sheet / lightbox / dialog
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Kbd>S</Kbd>
            <span className="text-muted">→ Stamp from inside the sheet</span>
          </div>
        </div>
      </>
    );
  }
  if (step === 4) {
    return (
      <>
        <div className="mt-4 rounded-xl border border-border bg-surface p-3">
          <div className="flex justify-end gap-2">
            <span className="rounded-lg px-3 py-1.5 text-xs text-muted">
              Cancel
            </span>
            <span className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-white">
              Stamp
            </span>
          </div>
          <div className="mt-3 flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2">
            <span
              className="rounded-full border-2 border-primary px-2 py-1 text-[10px] font-semibold text-primary"
              style={{ transform: "rotate(-2deg)" }}
            >
              VERIFIED
            </span>
            <span className="text-[11px] text-muted">
              Officer Name · 08-30-2026
            </span>
          </div>
        </div>
        <div className="mt-4 grid gap-1.5 text-xs">
          <div className="flex items-center gap-2">
            <Kbd>S</Kbd>
            <span className="text-muted">→ Stamp (inside detail)</span>
          </div>
          <div className="flex items-center gap-2">
            <Kbd>Esc</Kbd>
            <span className="text-muted">→ Cancel / dismiss</span>
          </div>
        </div>
        <p className="mt-2 text-xs text-muted">
          Bounce is earned — the stamp lands with momentum.
        </p>
      </>
    );
  }
  if (step === 5) {
    return (
      <>
        <div className="mt-4 space-y-3">
          <div className="rounded-xl border border-border bg-surface p-3">
            <p className="text-[11px] font-medium text-muted">
              Send back chips
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <span className="rounded-full bg-primary px-2.5 py-1 text-[11px] font-medium text-white">
                Wrong screenshot
              </span>
              <span className="rounded-full border border-border bg-surface px-2.5 py-1 text-[11px] text-muted">
                Screenshot unclear
              </span>
            </div>
            <div className="mt-2 flex justify-end">
              <span className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-white">
                Send
              </span>
            </div>
          </div>
          <div className="rounded-xl border border-border bg-surface p-3">
            <p className="text-[11px] font-medium text-muted">
              Profiling Form / Social Links
            </p>
            <div className="mt-2 flex items-center justify-between">
              <span className="truncate text-xs text-auth-blue">
                https://forms.gle/...
              </span>
              <span className="flex gap-1 text-[11px]">
                <span className="text-primary">Edit</span>
                <span className="text-muted">·</span>
                <span className="text-error">Remove</span>
              </span>
            </div>
          </div>
        </div>
        <div className="mt-4 grid gap-1.5 text-xs">
          <div className="flex items-center gap-2">
            <span className="text-muted">
              Chips toggle on click / Enter · Last-write-wins
            </span>
          </div>
        </div>
      </>
    );
  }
  return (
    <>
      <div className="mt-4 space-y-3">
        <div className="flex items-center gap-3 rounded-xl border border-border bg-surface p-3">
          <span className="relative flex h-8 w-8 items-center justify-center">
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              className="text-muted"
              aria-hidden="true"
            >
              <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
              <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
            </svg>
            <span className="absolute -right-1 -top-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-error px-1 text-[9px] font-bold text-white">
              4
            </span>
          </span>
          <div className="flex-1 text-xs">
            <p className="font-medium text-ink">J. Dela Cruz · Assessment</p>
            <p className="text-muted">
              12m ago → <span className="text-primary">Review</span>
            </p>
          </div>
        </div>
        <div className="rounded-xl border border-border bg-surface p-3">
          <div className="flex items-center gap-2">
            <span className="inline-block h-3 w-3 rounded-full bg-error animate-pulse"></span>
            <span className="text-[11px] text-muted">Camera feed (4:3)</span>
          </div>
          <div className="mt-2 flex justify-end gap-2">
            <span className="rounded-lg px-3 py-1.5 text-xs text-muted">
              Capture
            </span>
            <span className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-white">
              Save & stamp
            </span>
          </div>
        </div>
      </div>
      <div className="mt-4 grid gap-1.5 text-xs">
        <div className="flex items-center gap-2">
          <Kbd>1</Kbd>
          <span className="text-muted">–</span>
          <Kbd>7</Kbd>
          <span className="text-muted">·</span>
          <Kbd>J</Kbd>
          <Kbd>K</Kbd>
          <span className="text-muted">·</span>
          <Kbd>S</Kbd>
          <span className="text-muted">·</span>
          <Kbd>?</Kbd>
          <span className="text-muted">→ Full shortcuts</span>
        </div>
      </div>
    </>
  );
}
