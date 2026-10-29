import { useMemo } from "react";
import { YEAR_LEVELS, YEAR_LEVEL_LABELS } from "$lib/domain/constants";
import {
  BUCKET_DEFINITIONS,
  BUCKET_LABELS,
  STUDENT_BUCKETS,
  type StudentBucket,
} from "$lib/instructor/students";
import type { RosterStats } from "$lib/instructor/types";

const BUCKET_TONES: Record<StudentBucket, { dot: string; bar: string }> = {
  NOT_STARTED: { dot: "bg-muted/50", bar: "bg-muted/40" },
  IN_PROGRESS: { dot: "bg-gold", bar: "bg-gold/70" },
  READY_FOR_QUEUE: { dot: "bg-primary/60", bar: "bg-primary/50" },
  ENROLLED: { dot: "bg-primary", bar: "bg-primary" },
};

// ponytail: bucket-share springs dropped — widths render from live shares.
export default function StudentStatsStrip({
  stats,
  loading,
  activeBuckets,
  activeDepartmentIds,
  unassignedActive = false,
  onbucket,
  oncourse,
}: {
  stats: RosterStats | null;
  loading: boolean;
  activeBuckets: StudentBucket[];
  activeDepartmentIds: string[];
  unassignedActive?: boolean;
  onbucket: (bucket: StudentBucket) => void;
  oncourse: (departmentId: string | null) => void;
}) {
  const distribution = stats?.distribution ?? {
    NOT_STARTED: 0,
    IN_PROGRESS: 0,
    READY_FOR_QUEUE: 0,
    ENROLLED: 0,
  };
  const total = stats?.total ?? 0;
  const shares = useMemo(() => {
    const sum =
      STUDENT_BUCKETS.reduce(
        (acc, bucket) => acc + (distribution[bucket] ?? 0),
        0,
      ) || 1;
    return Object.fromEntries(
      STUDENT_BUCKETS.map((b) => [b, ((distribution[b] ?? 0) / sum) * 100]),
    ) as Record<StudentBucket, number>;
  }, [distribution]);
  const hasGrid = (stats?.byCourseYearLevel.length ?? 0) > 0;
  const namedCourses =
    ((stats?.byCourse ?? []) as any[]).filter((c) => c.departmentId !== null) ??
    [];
  const unassignedTotal = stats?.unassignedTotal ?? 0;

  return (
    <section
      className="rounded-2xl border border-border bg-surface-raised px-4 py-3"
      aria-label="Roster statistics"
      aria-busy={loading}
    >
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-sm font-medium tabular-nums tracking-tight text-ink">
          Total {stats?.total ?? 0}
        </span>
        {STUDENT_BUCKETS.map((bucket) => (
          <span key={bucket} className="contents">
            <span className="text-sm text-muted" aria-hidden="true">
              ·
            </span>
            <span
              className="text-sm tabular-nums text-muted"
              title={BUCKET_DEFINITIONS[bucket]}
            >
              {BUCKET_LABELS[bucket]}{" "}
              <span className="font-medium text-ink">
                {distribution[bucket] ?? 0}
              </span>
            </span>
          </span>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {namedCourses.map((course) => {
          const active = activeDepartmentIds.includes(
            course.departmentId ?? "",
          );
          return (
            <button
              key={course.departmentId}
              type="button"
              onClick={() => oncourse(course.departmentId)}
              aria-pressed={active}
              className={`press rounded-full border px-2.5 py-1 text-xs transition-colors ${active ? "border-primary/40 bg-primary/[0.08] font-medium text-primary" : "border-border bg-surface text-muted hover:text-ink"}`}
            >
              {course.departmentCode}
              <span className="ml-1 tabular-nums">{course.count}</span>
            </button>
          );
        })}
        {unassignedTotal > 0 && (
          <button
            type="button"
            onClick={() => oncourse(null)}
            aria-pressed={unassignedActive}
            title="Students with no course record for the selected academic year"
            className={`press rounded-full border border-dashed px-2.5 py-1 text-xs italic transition-colors ${unassignedActive ? "border-primary/40 bg-primary/[0.08] font-medium not-italic text-primary" : "border-border bg-surface text-muted hover:text-ink"}`}
          >
            Unassigned
            <span className="ml-1 tabular-nums not-italic">
              {unassignedTotal}
            </span>
          </button>
        )}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {STUDENT_BUCKETS.map((bucket) => {
          const active = activeBuckets.includes(bucket);
          return (
            <button
              key={bucket}
              type="button"
              onClick={() => onbucket(bucket)}
              aria-pressed={active}
              title={BUCKET_DEFINITIONS[bucket]}
              className={`press inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-sm transition-colors ${active ? "border-primary/40 bg-primary/[0.06] font-medium text-ink" : "border-transparent text-muted hover:bg-ink/[0.03] hover:text-ink"}`}
            >
              <span
                className={`h-2 w-2 rounded-full ${BUCKET_TONES[bucket].dot}`}
                aria-hidden="true"
              />
              {BUCKET_LABELS[bucket]}
              <span className="tabular-nums text-ink">
                {distribution[bucket] ?? 0}
              </span>
            </button>
          );
        })}
      </div>
      {total > 0 && (
        <div
          className="mt-2 flex h-1.5 w-full overflow-hidden rounded-full bg-surface"
          role="img"
          aria-label={`Distribution: ${STUDENT_BUCKETS.map((bucket) => `${BUCKET_LABELS[bucket]} ${distribution[bucket] ?? 0}`).join(", ")}`}
        >
          <span
            className={`h-full ${BUCKET_TONES.ENROLLED.bar} transition-[width] duration-300 motion-reduce:transition-none`}
            style={{ width: `${shares.ENROLLED}%` }}
          />
          <span
            className={`h-full ${BUCKET_TONES.READY_FOR_QUEUE.bar} transition-[width] duration-300 motion-reduce:transition-none`}
            style={{ width: `${shares.READY_FOR_QUEUE}%` }}
          />
          <span
            className={`h-full ${BUCKET_TONES.IN_PROGRESS.bar} transition-[width] duration-300 motion-reduce:transition-none`}
            style={{ width: `${shares.IN_PROGRESS}%` }}
          />
          <span
            className={`h-full ${BUCKET_TONES.NOT_STARTED.bar}`}
            style={{ width: `${shares.NOT_STARTED}%` }}
          />
        </div>
      )}
      {hasGrid && (
        <details className="group mt-3">
          <summary className="inline-flex cursor-pointer list-none items-center gap-1 text-xs text-muted transition-colors hover:text-ink [&::-webkit-details-marker]:hidden">
            <svg
              width="11"
              height="11"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
              className="transition-transform duration-200 ease-out group-open:rotate-90"
            >
              <path
                d="M9 6l6 6-6 6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            By course and year level
          </summary>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-muted">
                  <th scope="col" className="py-1 pr-4 font-medium">
                    Course
                  </th>
                  {YEAR_LEVELS.map((level) => (
                    <th
                      key={level}
                      scope="col"
                      className="px-2 py-1 text-right font-medium"
                    >
                      {YEAR_LEVEL_LABELS[level]}
                    </th>
                  ))}
                  <th scope="col" className="py-1 pl-2 text-right font-medium">
                    Total
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {(stats?.byCourseYearLevel ?? []).map((row: any) => (
                  <tr key={row.departmentId}>
                    <th
                      scope="row"
                      className="py-1.5 pr-4 text-left font-normal text-ink"
                    >
                      {row.departmentCode}
                    </th>
                    {YEAR_LEVELS.map((level) => (
                      <td
                        key={level}
                        className={`px-2 py-1.5 text-right tabular-nums ${row.counts[level] ? "text-ink" : "text-muted/40"}`}
                      >
                        {row.counts[level] ?? 0}
                      </td>
                    ))}
                    <td className="py-1.5 pl-2 text-right font-medium tabular-nums text-ink">
                      {row.total}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </section>
  );
}
