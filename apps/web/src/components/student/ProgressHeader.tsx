import type { ReactNode } from "react";

export default function ProgressHeader({
  verifiedCount,
  total = 6,
  studentName,
  studentNumber,
  actions,
}: {
  verifiedCount: number;
  total?: number;
  studentName: string;
  studentNumber: string | null;
  actions?: ReactNode;
}) {
  const percent = total > 0 ? Math.round((verifiedCount / total) * 100) : 0;
  return (
    <header className="material sticky top-0 z-30 border-b border-ink/[0.06] bg-chrome/80 backdrop-blur-xl backdrop-saturate-150">
      <div className="mx-auto flex w-full max-w-[560px] flex-col px-4 pb-3 pt-3">
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
              Enrollment
            </p>
            <h2 className="truncate text-[28px] font-bold leading-[1.1] tracking-[-0.02em] text-ink">
              Your Progress
            </h2>
            <p className="mt-0.5 truncate text-[13px] text-muted">
              {studentName}
              {studentNumber ? (
                <span className="tabular-nums"> · #{studentNumber}</span>
              ) : null}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2 pb-1">
            <span
              aria-hidden="true"
              className="rounded-full bg-primary px-2.5 py-0.5 text-[13px] font-semibold tabular-nums text-white"
            >
              {verifiedCount}/{total}
            </span>
            {actions}
          </div>
        </div>
        <div
          className="mt-2.5 h-1 w-full overflow-hidden rounded-full bg-ink/10"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={verifiedCount}
          aria-label={`${percent}% of steps complete`}
        >
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none"
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>
    </header>
  );
}
