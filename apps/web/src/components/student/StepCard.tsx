import DriveThumb from "../DriveThumb";
import { chipFor } from "$lib/student/steps";
import type { QueueEntry, StepRow } from "$lib/student/types";

export default function StepCard({
  step,
  hint,
  readyForQueue,
  queue,
  onclick,
}: {
  step: StepRow;
  hint: string;
  readyForQueue: boolean;
  queue: QueueEntry | null;
  onclick: () => void;
}) {
  const chip = chipFor(step);
  const isReadyCard =
    step.code === "ENROLLMENT" &&
    step.status === "PENDING" &&
    readyForQueue &&
    !queue;

  const replyPreview = step.reply
    ? step.reply.note
      ? step.reply.note.slice(0, 32)
      : (step.reply.chips[0] ?? "Review reply")
    : "";
  const replyFull = step.reply
    ? step.reply.note
      ? step.reply.note
      : (step.reply.chips[0] ?? "Review reply")
    : "";
  const thumbs = (step.evidence as any[]).filter(
    (e) => e.kind !== "EXTERNAL_LINK" && !e.expired,
  );

  const done = step.status === "VERIFIED";

  return (
    <button
      type="button"
      onClick={onclick}
      className={`step-card group flex w-full items-center gap-3 px-4 py-3 text-left transition-[background-color,scale] duration-100 ease-out active:bg-ink/[0.04] active:scale-[0.99] motion-reduce:active:scale-none lg:hover:bg-ink/[0.03] ${isReadyCard ? "bg-primary/[0.04]" : ""}`}
    >
      <span
        aria-hidden="true"
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold tabular-nums ${
          done ? "bg-primary text-white" : "bg-ink/[0.06] text-muted"
        }`}
      >
        {done ? (
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M20 6 9 17l-5-5" />
          </svg>
        ) : (
          step.order
        )}
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate text-[17px] font-semibold leading-snug tracking-[-0.01em] text-ink">
            {step.name}
          </span>
          {isReadyCard ? (
            <span
              aria-hidden="true"
              className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary"
            />
          ) : null}
          <span
            className={`ml-auto shrink-0 rounded-full px-2 py-0.5 text-[12px] font-semibold ${chip.classes}`}
          >
            {chip.label}
          </span>
        </span>
        <span className="mt-0.5 flex min-w-0 items-center gap-2 text-[13px] leading-snug">
          {step.status === "RETURNED" && step.reply ? (
            <>
              <span className="truncate text-warning lg:hidden">
                Officer: {replyPreview}
                {step.reply.note && step.reply.note.length > 32 ? "…" : ""}
              </span>
              <span className="hidden text-warning lg:inline">
                Officer: {replyFull}
              </span>
            </>
          ) : (
            <span className="truncate text-muted lg:whitespace-normal">
              {hint}
            </span>
          )}
          {step.status === "VERIFIED" && step.stamp ? (
            <span
              title={`Verified by ${step.stamp.verifiedByName}`}
              className="hidden -rotate-3 shrink-0 rounded-md border border-primary/40 bg-surface px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-primary/70 lg:inline-flex"
            >
              Verified · {step.stamp.verifiedByName}
            </span>
          ) : null}
          {thumbs.length > 0 ? (
            <span className="flex shrink-0 items-center">
              <span className="flex -space-x-1.5">
                {thumbs.slice(0, 3).map((e, i) => (
                  <DriveThumb
                    key={e.id}
                    item={e}
                    alt={`${step.name} evidence ${i + 1}`}
                    className="h-9 w-9 rounded-lg border border-border object-cover"
                  />
                ))}
              </span>
              {thumbs.length > 3 ? (
                <span className="ml-1.5 text-[11px] tabular-nums text-muted">
                  +{thumbs.length - 3}
                </span>
              ) : null}
            </span>
          ) : null}
        </span>
      </span>

      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        className={`shrink-0 transition-transform duration-100 ease-out group-active:scale-[0.97] lg:group-hover:translate-x-0.5 ${
          isReadyCard ? "text-primary" : "text-muted/30"
        }`}
      >
        <path d="m9 18 6-6-6-6" />
      </svg>
    </button>
  );
}
