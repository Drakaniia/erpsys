import type { CSSProperties } from "react";
import { Bar } from "@/components/charts/bar";
import { BarChart } from "@/components/charts/bar-chart";
import { BarXAxis } from "@/components/charts/bar-x-axis";
import { Grid } from "@/components/charts/grid";
import { ChartTooltip } from "@/components/charts/tooltip/chart-tooltip";
import { TooltipContent } from "@/components/charts/tooltip/tooltip-content";
import type { AdminOverview, OverviewSummary } from "$lib/admin/overview";
import { headline, orderedSteps } from "$lib/admin/overview";
import Skeleton from "../../ui/Skeleton";
import { Panel, PanelEmpty } from "./Panel";

const SERIES = [
  { key: "verified", label: "Verified", color: "var(--chart-1)" },
  { key: "unverified", label: "Not yet verified", color: "var(--chart-2)" },
] as const;

export function OverviewHeadline({
  data,
  summary,
}: {
  data: AdminOverview | undefined;
  summary: OverviewSummary | null;
}) {
  if (!data || !summary) {
    return (
      <div className="flex flex-col gap-3 py-2" aria-hidden="true">
        <Skeleton h="1.75rem" w="min(34rem, 90%)" radius="0.375rem" />
        <Skeleton h="1.75rem" w="min(24rem, 70%)" radius="0.375rem" index={1} />
        <Skeleton h="2.5rem" w="min(28rem, 80%)" radius="0.5rem" index={2} className="mt-3" />
      </div>
    );
  }

  const { lead, follow } = headline(data, summary);
  const figures = data.activeYear
    ? [
        { label: "In line now", value: summary.waiting },
        { label: "Being served", value: summary.serving },
        { label: "Not yet verified", value: summary.notVerified },
      ]
    : [];

  return (
    <div
      className="ov-rise flex flex-col gap-5 py-2"
      style={{ "--ov-i": 0 } as CSSProperties}
    >
      <p className="max-w-[46rem] text-balance text-[1.625rem] font-semibold leading-[1.18] tracking-[-0.025em] text-ink sm:text-[2rem]">
        {lead} <span className="text-muted">{follow}</span>
      </p>
      {figures.length > 0 && (
        <dl className="ov-figures flex flex-wrap gap-y-3">
          {figures.map((f) => (
            <div key={f.label} className="flex flex-col gap-1 pr-6 sm:px-6 sm:first:pl-0">
              <dt className="text-xs text-muted">{f.label}</dt>
              <dd className="text-xl font-semibold tabular-nums tracking-tight text-ink">
                {f.value.toLocaleString()}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

export function ClearanceLine({
  data,
  onactivate,
}: {
  data: AdminOverview | undefined;
  onactivate: () => void;
}) {
  const title = "Where submissions stand, step by step";

  if (data && !data.activeYear) {
    return (
      <Panel title={title} index={1}>
        <PanelEmpty
          action={
            <button
              type="button"
              onClick={onactivate}
              className="ov-link rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-white"
            >
              Activate academic year
            </button>
          }
        >
          Step verifications are counted per academic year. Activate a year to
          see how students move through the clearance steps.
        </PanelEmpty>
      </Panel>
    );
  }

  const steps = data ? orderedSteps(data) : [];
  const rows = steps.map((s) => ({
    name: s.name,
    verified: s.verified,
    unverified: s.unverified,
  }));
  const loading = !data;
  const empty = !loading && rows.every((r) => r.verified + r.unverified === 0);

  return (
    <Panel
      title={title}
      description="Submissions per clearance step this term. A tall gold segment means officers have a pile to review."
      index={1}
    >
      {empty ? (
        <PanelEmpty>
          No step submissions yet this term. Bars appear as students submit and
          officers verify.
        </PanelEmpty>
      ) : (
        <>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {SERIES.map((s) => (
              <span key={s.key} className="flex items-center gap-1.5 text-xs text-muted">
                <span className="size-2 rounded-full" style={{ backgroundColor: s.color }} />
                {s.label}
              </span>
            ))}
          </div>
          <BarChart
            data={rows}
            xDataKey="name"
            stacked
            stackGap={2}
            barGap={0.45}
            status={loading ? "loading" : "ready"}
            aspectRatio="3.6 / 1"
            className="min-h-56"
            margin={{ top: 20, right: 8, bottom: 32, left: 8 }}
          >
            <Grid horizontal numTicksRows={4} />
            {SERIES.map((s) => (
              <Bar key={s.key} dataKey={s.key} fill={s.color} lineCap={4} />
            ))}
            <BarXAxis showAllLabels />
            <ChartTooltip
              content={({ point }) => (
                <TooltipContent
                  title={String(point.name ?? "")}
                  rows={SERIES.map((s) => ({
                    color: s.color,
                    label: s.label,
                    value: Number(point[s.key] ?? 0),
                  }))}
                />
              )}
            />
          </BarChart>
          <table className="sr-only">
            <caption>Clearance submissions by step</caption>
            <thead>
              <tr>
                <th scope="col">Step</th>
                <th scope="col">Verified</th>
                <th scope="col">Not yet verified</th>
              </tr>
            </thead>
            <tbody>
              {steps.map((s) => (
                <tr key={s.code}>
                  <th scope="row">{s.name}</th>
                  <td>{s.verified}</td>
                  <td>{s.unverified}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </Panel>
  );
}
