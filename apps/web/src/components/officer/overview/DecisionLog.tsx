import { absoluteTime, relativeTime } from "$lib/officer/format";
import type { OfficerOverview } from "$lib/officer/overview";
import Skeleton from "../../ui/Skeleton";
import { Panel, PanelQuiet } from "./Panel";
import { RETURNED, VERIFIED } from "./palette";

function Mark({ action }: { action: string }) {
  const returned = action === "Returned";
  const color = returned ? RETURNED : VERIFIED;
  return (
    <span
      aria-hidden="true"
      className="flex size-6 shrink-0 items-center justify-center rounded-full"
      style={{ backgroundColor: `color-mix(in oklab, ${color} 14%, transparent)`, color }}
    >
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        {returned ? (
          <path d="M9 14 4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
        ) : (
          <path d="M20 6 9 17l-5-5" />
        )}
      </svg>
    </span>
  );
}

export function DecisionLog({
  model,
  index,
}: {
  model: OfficerOverview | null;
  index: number;
}) {
  return (
    <Panel
      title="Latest decisions"
      description="Submissions verified or returned this term, newest first."
      index={index}
    >
      {!model ? (
        <ul className="flex flex-col gap-3" aria-hidden="true">
          {[0, 1, 2, 3].map((i) => (
            <li key={i} className="flex items-center gap-3">
              <Skeleton h="1.5rem" w="1.5rem" radius="9999px" index={i} />
              <Skeleton h="0.75rem" w="60%" index={i} />
            </li>
          ))}
        </ul>
      ) : model.decisions.length === 0 ? (
        <PanelQuiet>
          No decisions yet this term. Submissions you verify or return show
          here.
        </PanelQuiet>
      ) : (
        <ol className="flex flex-col">
          {model.decisions.map((d) => (
            <li
              key={d.id}
              className="flex items-center gap-3 border-t border-border py-2.5 first:border-t-0 first:pt-0"
            >
              <Mark action={d.action} />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm font-medium text-ink">
                  {d.studentName}
                </span>
                <span className="truncate text-xs text-muted">
                  {d.action}
                  {d.stepName ? ` · ${d.stepName}` : ""}
                </span>
              </span>
              {d.at && (
                <time
                  dateTime={d.at}
                  title={absoluteTime(d.at)}
                  className="shrink-0 text-xs text-muted tabular-nums"
                >
                  {relativeTime(d.at)}
                </time>
              )}
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}
