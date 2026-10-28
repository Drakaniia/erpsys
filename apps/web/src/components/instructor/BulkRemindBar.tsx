// ponytail: svelte spring enter animation dropped — settled DOM identical.
// Add when motion polish matters (see AppleSwitch useSpring pattern).
export default function BulkRemindBar({
  count,
  busy = false,
  onclear,
  onremind,
}: {
  count: number;
  busy?: boolean;
  onclear: () => void;
  onremind: () => void;
}) {
  if (count <= 0) return null;
  return (
    <div className="pointer-events-none fixed bottom-6 left-1/2 z-40 flex -translate-x-1/2 justify-center px-4">
      <div className="pointer-events-auto flex items-center gap-3 rounded-2xl border border-border bg-surface-raised px-4 py-3 shadow-lg">
        <span className="text-sm font-medium tabular-nums tracking-tight text-ink">
          {count} selected
        </span>
        <div className="h-4 w-px bg-border/60" aria-hidden="true" />
        <button
          type="button"
          onClick={onclear}
          className="press rounded-lg px-2.5 py-1.5 text-sm text-muted transition-colors hover:bg-ink/[0.05] hover:text-ink"
        >
          Clear
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onremind}
          className="press rounded-xl bg-primary px-4 py-1.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-primary/90 disabled:opacity-60"
          aria-label={`Send a reminder to ${count} selected students`}
        >
          {busy ? "Sending…" : "Send reminder"}
        </button>
      </div>
    </div>
  );
}
