import { summarize, type AccountRole, type AdminOverview } from "$lib/admin/overview";
import type { OverviewData } from "$lib/admin/types";
import { AccountMix } from "./overview/AccountMix";
import { ClearanceLine, OverviewHeadline } from "./overview/ClearanceLine";
import { DepartmentLines } from "./overview/DepartmentLines";
import { QueueMovement } from "./overview/QueueMovement";
import { RecentActions } from "./overview/RecentActions";
import "./overview/overview.css";

export default function OverviewStats({
  data: raw,
  onopenusers,
  onopenyears,
  onopenaudit,
  onopendepartments,
}: {
  data: OverviewData | undefined;
  onopenusers: (role: AccountRole) => void;
  onopenyears: () => void;
  onopenaudit: () => void;
  onopendepartments: () => void;
}) {
  const data = raw as AdminOverview | undefined;
  const summary = data ? summarize(data) : null;
  const tracking = !data || data.activeYear != null;

  return (
    <div className="flex flex-col gap-6 pb-4 pt-2">
      <OverviewHeadline data={data} summary={summary} />

      <ClearanceLine data={data} onactivate={onopenyears} />

      {tracking && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          <div className="flex min-w-0 lg:col-span-7">
            <QueueMovement data={data} index={2} />
          </div>
          <div className="flex min-w-0 lg:col-span-5">
            <DepartmentLines
              data={data}
              index={3}
              onopendepartments={onopendepartments}
            />
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="flex min-w-0 lg:col-span-5">
          <AccountMix data={data} index={4} onopenusers={onopenusers} />
        </div>
        <div className="flex min-w-0 lg:col-span-7">
          <RecentActions data={data} index={5} onopenaudit={onopenaudit} />
        </div>
      </div>
    </div>
  );
}
