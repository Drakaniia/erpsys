export default function SkeletonRows({
  view,
  count,
}: {
  view: "table" | "cards";
  count?: number;
}) {
  const rows = view === "table" ? (count ?? 6) : (count ?? 3);
  if (view === "table") {
    return (
      <div
        role="status"
        aria-busy="true"
        aria-label="Loading submissions"
        className="overflow-hidden rounded-xl border border-border bg-surface-raised"
      >
        <span className="sr-only">Loading submissions…</span>
        <div aria-hidden="true" className="divide-y divide-border">
          {Array.from({ length: rows }, (_, i) => i).map((i) => (
            <div
              key={i}
              className="grid h-14 grid-cols-[minmax(0,2.2fr)_minmax(0,1fr)_minmax(0,1.6fr)_minmax(0,0.9fr)_minmax(0,0.9fr)] items-center gap-4 px-4"
              style={{ "--skeleton-i": i } as React.CSSProperties}
            >
              <div className="flex min-w-0 items-center gap-2.5">
                <span className="flex w-2 shrink-0 justify-center"></span>
                <div className="skeleton h-8 w-8 shrink-0 rounded-full"></div>
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="skeleton h-3 w-2/3 rounded"></div>
                  <div className="skeleton h-2.5 w-1/3 rounded"></div>
                </div>
              </div>
              <div className="skeleton h-3 w-14 rounded"></div>
              <div className="flex items-center gap-1.5">
                <div className="skeleton h-14 w-14 rounded-lg"></div>
                <div className="skeleton h-14 w-14 rounded-lg"></div>
                <div className="skeleton h-14 w-14 rounded-lg"></div>
              </div>
              <div className="skeleton h-5 w-16 rounded-full"></div>
              <div className="flex justify-end">
                <div className="skeleton h-4 w-12 rounded"></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Loading submissions"
      className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3"
    >
      <span className="sr-only">Loading submissions…</span>
      <div aria-hidden="true" className="contents">
        {Array.from({ length: rows }, (_, i) => i).map((i) => (
          <div
            key={i}
            className="card-row flex min-h-[96px] rounded-xl border border-border bg-surface-raised p-4"
            style={{ "--skeleton-i": i } as React.CSSProperties}
          >
            <div className="flex w-full flex-col gap-3">
              <div className="flex items-start gap-2.5">
                <span className="flex w-2 shrink-0 justify-center pt-2"></span>
                <div className="skeleton h-8 w-8 shrink-0 rounded-full"></div>
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="skeleton h-3 w-2/3 rounded"></div>
                  <div className="flex items-center gap-1.5">
                    <div className="skeleton h-2.5 w-20 rounded"></div>
                    <div className="skeleton h-2.5 w-14 rounded"></div>
                  </div>
                </div>
                <div className="ml-auto">
                  <div className="skeleton h-5 w-16 rounded-full"></div>
                </div>
              </div>
              <div className="flex items-end justify-between gap-3">
                <div className="flex items-center gap-1.5">
                  <div className="skeleton h-16 w-16 rounded-lg"></div>
                  <div className="skeleton h-16 w-16 rounded-lg"></div>
                  <div className="skeleton h-16 w-16 rounded-lg"></div>
                </div>
                <div className="skeleton h-4 w-12 rounded"></div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Matches ProfilingFormPanel's rounded-xl border bg-surface-raised p-6 panel
// (label + max-w-xl input + hint + save/cancel buttons).
export function ProfilingFormSkeleton() {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Loading profiling form"
      className="flex flex-col gap-4 rounded-xl border border-border bg-surface-raised p-6"
    >
      <span className="sr-only">Loading profiling form…</span>
      <div aria-hidden="true" className="flex flex-col gap-1">
        <div className="skeleton h-4 w-32 rounded"></div>
        <div className="skeleton mt-1 h-10 w-full max-w-xl rounded-lg"></div>
        <div className="skeleton mt-1 h-3 w-64 rounded"></div>
      </div>
      <div aria-hidden="true" className="flex gap-2">
        <div className="skeleton h-9 w-24 rounded-lg"></div>
        <div className="skeleton h-9 w-20 rounded-lg"></div>
      </div>
    </div>
  );
}

// Matches SocialMediaLinksPanel's p-6 list panel (header row + py-2.5 rows
// with reorder arrows, name/url lines, edit/remove buttons).
export function SocialLinksSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Loading social media pages"
      className="flex flex-col gap-3 rounded-xl border border-border bg-surface-raised p-6"
    >
      <span className="sr-only">Loading social media pages…</span>
      <div
        aria-hidden="true"
        className="flex items-center justify-between gap-4"
      >
        <div className="skeleton h-4 w-48 rounded"></div>
        <div className="skeleton h-8 w-20 rounded-lg"></div>
      </div>
      <div aria-hidden="true" className="divide-y divide-border">
        {Array.from({ length: count }, (_, i) => i).map((i) => (
          <div
            key={i}
            className="flex items-center gap-3 py-2.5"
            style={{ "--skeleton-i": i } as React.CSSProperties}
          >
            <div className="skeleton h-8 w-3.5 rounded"></div>
            <div className="min-w-0 flex-1 space-y-1.5">
              <div className="skeleton h-4 w-1/3 rounded"></div>
              <div className="skeleton h-3 w-2/3 rounded"></div>
            </div>
            <div className="flex shrink-0 gap-1">
              <div className="skeleton h-6 w-12 rounded-lg"></div>
              <div className="skeleton h-6 w-14 rounded-lg"></div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
