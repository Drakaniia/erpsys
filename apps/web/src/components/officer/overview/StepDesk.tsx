import type { CSSProperties } from "react";
import { percent, waitedFor, type OfficerOverview } from "$lib/officer/overview";
import type { OfficerTab } from "$lib/officer/tabs";
import Skeleton from "../../ui/Skeleton";
import { Key, Panel } from "./Panel";
import { AWAITING, AWAITING_INK, RETURNED, VERIFIED } from "./palette";

function DeskSkeleton() {
  return (
    <ul className="flex flex-col" aria-hidden="true">
      {[0, 1, 2, 3, 4].map((i) => (
        <li key={i} className="flex items-center gap-4 py-3.5">
          <Skeleton h="1.75rem" w="1.75rem" radius="0.5rem" index={i} />
          <div className="flex flex-1 flex-col gap-1.5">
            <Skeleton h="0.875rem" w="40%" index={i} />
            <Skeleton h="0.375rem" w="100%" radius="9999px" index={i} />
          </div>
          <Skeleton h="1.5rem" w="2.5rem" index={i} />
        </li>
      ))}
    </ul>
  );
}

export function StepDesk({
  model,
  index,
  onopenstep,
}: {
  model: OfficerOverview | null;
  index: number;
  onopenstep: (tab: OfficerTab) => void;
}) {
  return (
    <Panel
      title="Where to review next"
      description="Each clearance step in order. The bar splits this term's submissions; the number is what's waiting on you."
      index={index}
      aside={
        model ? (
          <div className="hidden shrink-0 flex-col items-end gap-1 sm:flex">
            <Key color={VERIFIED} label="Verified" />
            <Key color={AWAITING} label="Awaiting review" />
            <Key color={RETURNED} label="Returned" />
          </div>
        ) : null
      }
    >
      {!model ? (
        <DeskSkeleton />
      ) : (
        <ol className="-mx-2 flex flex-col">
          {model.steps.map((step, i) => {
            const total = step.verified + step.unverified;
            const other = Math.max(0, step.unverified - step.awaitingReview - step.returned);
            const isLongest =
              model.longestWait?.code === step.code && step.awaitingReview > 0;
            const segments = [
              { key: "verified", value: step.verified, color: VERIFIED },
              { key: "awaiting", value: step.awaitingReview, color: AWAITING },
              { key: "returned", value: step.returned, color: RETURNED },
              { key: "other", value: other, color: "var(--chart-4)" },
            ].filter((s) => s.value > 0);
            const summary = [
              `${step.verified} verified`,
              `${step.awaitingReview} awaiting review`,
              `${step.returned} returned`,
            ].join(", ");

            return (
              <li key={step.code}>
                <button
                  type="button"
                  onClick={() => onopenstep(step.tab)}
                  aria-label={`${step.name}: ${summary}. Open ${step.name} submissions.`}
                  className="oo-row grid w-full grid-cols-[1.75rem_minmax(0,1fr)_auto] items-center gap-x-4 rounded-xl px-2 py-3 text-left"
                  style={{ "--oo-i": i } as CSSProperties}
                >
                  <span
                    aria-hidden="true"
                    className="flex size-7 items-center justify-center rounded-lg border border-border text-xs font-semibold text-muted tabular-nums"
                  >
                    {step.order}
                  </span>

                  <span className="flex min-w-0 flex-col gap-1.5">
                    <span className="flex min-w-0 items-baseline gap-2">
                      <span className="truncate text-sm font-semibold text-ink">
                        {step.name}
                      </span>
                      {isLongest && (
                        <span
                          className="shrink-0 text-[11px] font-medium"
                          style={{ color: AWAITING_INK }}
                        >
                          Longest wait
                        </span>
                      )}
                    </span>
                    <span
                      aria-hidden="true"
                      className="oo-bar flex h-1.5 w-full gap-[2px] overflow-hidden rounded-full bg-ink/[0.06]"
                    >
                      {segments.map((s) => (
                        <span
                          key={s.key}
                          className="h-full first:rounded-l-full last:rounded-r-full"
                          style={{
                            width: `${percent(s.value, total)}%`,
                            backgroundColor: s.color,
                          }}
                        />
                      ))}
                    </span>
                    <span className="truncate text-xs text-muted tabular-nums">
                      {step.oldestAwaitingAt && step.awaitingReview > 0
                        ? `Oldest waiting ${waitedFor(step.oldestAwaitingAt)}`
                        : step.hint}
                      {total > 0 && (
                        <span className="text-muted/80">
                          {" "}
                          · {step.verified.toLocaleString()} of{" "}
                          {total.toLocaleString()} verified
                        </span>
                      )}
                    </span>
                  </span>

                  <span className="flex min-w-[3.5rem] flex-col items-end">
                    {step.awaitingReview > 0 ? (
                      <>
                        <span
                          className="text-xl font-semibold leading-none tracking-tight tabular-nums"
                          style={{ color: AWAITING_INK }}
                        >
                          {step.awaitingReview.toLocaleString()}
                        </span>
                        <span className="mt-1 text-[11px] text-muted">waiting</span>
                      </>
                    ) : (
                      <span className="text-xs font-medium text-muted">Clear</span>
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      )}
    </Panel>
  );
}
