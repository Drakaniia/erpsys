import StepCard from "./StepCard";
import { STEP_ORDER, stepHint } from "$lib/student/steps";
import type { MyStepsData, QueueEntry } from "$lib/student/types";

export default function StepChecklist({
  data,
  readyForQueue,
  queue,
  onopen,
}: {
  data: MyStepsData;
  readyForQueue: boolean;
  queue: QueueEntry | null;
  onopen: (stepCode: string) => void;
}) {
  return (
    <section
      aria-label="Enrollment steps"
      className="checklist divide-y divide-ink/[0.06] overflow-hidden rounded-[20px] border border-ink/[0.06] bg-surface-raised shadow-[0_1px_2px_rgba(16,24,40,0.05)]"
    >
      {STEP_ORDER.map((code) => {
        const step = (data.steps as any[]).find((s) => s.code === code);
        if (!step) return null;
        return (
          <div key={code}>
            <StepCard
              step={step}
              hint={stepHint(step, { readyForQueue, queue })}
              readyForQueue={readyForQueue}
              queue={queue}
              onclick={() => onopen(step.code)}
            />
          </div>
        );
      })}
    </section>
  );
}
