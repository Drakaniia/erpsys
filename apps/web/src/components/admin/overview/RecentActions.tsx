import { relativeTime } from "$lib/officer/format";
import type { AdminOverview } from "$lib/admin/overview";
import Skeleton from "../../ui/Skeleton";
import { Panel, PanelEmpty, PanelLink } from "./Panel";

const absolute = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

export function RecentActions({
  data,
  index,
  onopenaudit,
}: {
  data: AdminOverview | undefined;
  index: number;
  onopenaudit: () => void;
}) {
  return (
    <Panel
      title="Latest admin changes"
      description="The five most recent actions from the audit log."
      index={index}
      action={<PanelLink onClick={onopenaudit}>Audit log</PanelLink>}
    >
      {!data ? (
        <ul className="flex flex-col gap-4 pt-1" aria-hidden="true">
          {[0, 1, 2, 3].map((i) => (
            <li key={i} className="flex items-center gap-3">
              <Skeleton h="0.75rem" w="6rem" index={i} />
              <Skeleton h="0.75rem" w="40%" index={i} />
              <Skeleton h="0.75rem" w="3rem" index={i} className="ml-auto" />
            </li>
          ))}
        </ul>
      ) : data.recentActivity.length === 0 ? (
        <PanelEmpty>
          No admin actions recorded yet. Changes to users, departments and
          academic years appear here as they happen.
        </PanelEmpty>
      ) : (
        <ol className="flex flex-col">
          {data.recentActivity.map((a) => {
            const at = new Date(a.at);
            return (
              <li
                key={a.id}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-4 border-b border-border py-2.5 last:border-b-0"
              >
                <p className="min-w-0 truncate text-sm text-ink">
                  <span className="font-medium">{a.actorName}</span>{" "}
                  <span className="text-muted">{a.action.toLowerCase()}</span>
                  {a.targetRef && (
                    <span className="text-ink"> · {a.targetRef}</span>
                  )}
                </p>
                <time
                  dateTime={a.at}
                  title={Number.isNaN(at.getTime()) ? undefined : absolute.format(at)}
                  className="text-xs tabular-nums text-muted"
                >
                  {relativeTime(a.at)}
                </time>
              </li>
            );
          })}
        </ol>
      )}
    </Panel>
  );
}
