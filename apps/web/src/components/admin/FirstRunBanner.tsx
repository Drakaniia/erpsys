// ponytail: Svelte `in:fade` entry animation dropped — the settled DOM is
// identical; add a CSS keyframe if the entry fade is ever missed.
export default function FirstRunBanner({
  compact = false,
  onactivate,
}: {
  compact?: boolean;
  onactivate: () => void;
}) {
  if (compact) {
    return (
      <div
        className="flex items-center justify-between gap-4 rounded-lg border border-warning/30 bg-warning/5 px-4 py-2"
        role="status"
      >
        <p className="text-sm text-ink">
          <span className="font-medium text-warning">
            No active academic year
          </span>
          <span className="text-muted"> — activate one to begin.</span>
        </p>
        <button
          onClick={onactivate}
          className="shrink-0 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-white"
        >
          Activate academic year
        </button>
      </div>
    );
  }

  return (
    <div
      className="flex flex-col gap-3 rounded-xl border border-warning/30 bg-warning/5 p-5"
      role="status"
    >
      <div className="flex flex-col gap-2">
        <p className="text-base font-semibold tracking-tight text-ink">
          No active academic year — activate one to begin.
        </p>
        <p className="text-sm text-muted">
          Year-gated sections (Profiling Form, overview stats) stay disabled
          until the first year is activated.
        </p>
      </div>
      <div>
        <button
          onClick={onactivate}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white"
        >
          Activate academic year
        </button>
      </div>
    </div>
  );
}
