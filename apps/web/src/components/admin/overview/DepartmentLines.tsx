import { Bar } from "@/components/charts/bar";
import { BarChart } from "@/components/charts/bar-chart";
import { BarYAxis } from "@/components/charts/bar-y-axis";
import { Grid } from "@/components/charts/grid";
import { ChartTooltip } from "@/components/charts/tooltip/chart-tooltip";
import { TooltipContent } from "@/components/charts/tooltip/tooltip-content";
import type { AdminOverview } from "$lib/admin/overview";
import { Panel, PanelEmpty, PanelLink } from "./Panel";

const SERIES = [
  { key: "waiting", label: "Waiting", color: "var(--chart-2)" },
  { key: "serving", label: "Being served", color: "var(--chart-3)" },
  { key: "enrolled", label: "Enrolled", color: "var(--chart-1)" },
] as const;

const ROW_PX = 44;

export function DepartmentLines({
  data,
  index,
  onopendepartments,
}: {
  data: AdminOverview | undefined;
  index: number;
  onopendepartments: () => void;
}) {
  const rows = (data?.departmentTallies ?? []).map((d) => ({
    code: d.code,
    name: d.name,
    waiting: d.waiting,
    serving: d.serving ?? 0,
    enrolled: d.enrolled,
  }));
  const loading = !data;
  const height = Math.max(4, loading ? 4 : rows.length) * ROW_PX + 48;

  return (
    <Panel
      title="Which department line is backed up?"
      description="Queue entries this term, per department."
      index={index}
      action={<PanelLink onClick={onopendepartments}>Departments</PanelLink>}
    >
      {!loading && rows.length === 0 ? (
        <PanelEmpty
          action={<PanelLink onClick={onopendepartments}>Add a department</PanelLink>}
        >
          No departments yet. Each department gets its own enrollment line.
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
          <div style={{ height }} className="mt-1">
            <BarChart
              data={rows}
              xDataKey="code"
              orientation="horizontal"
              stacked
              stackGap={2}
              barGap={0.38}
              status={loading ? "loading" : "ready"}
              aspectRatio="auto"
              className="h-full"
              margin={{ top: 12, right: 12, bottom: 12, left: 56 }}
            >
              <Grid horizontal={false} vertical numTicksColumns={4} />
              {SERIES.map((s) => (
                <Bar key={s.key} dataKey={s.key} fill={s.color} lineCap={4} />
              ))}
              <BarYAxis />
              <ChartTooltip
                content={({ point }) => (
                  <TooltipContent
                    title={String(point.name ?? point.code ?? "")}
                    rows={SERIES.map((s) => ({
                      color: s.color,
                      label: s.label,
                      value: Number(point[s.key] ?? 0),
                    }))}
                  />
                )}
              />
            </BarChart>
          </div>
          {!loading && (
            <table className="sr-only">
              <caption>Enrollment line by department</caption>
              <thead>
                <tr>
                  <th scope="col">Department</th>
                  {SERIES.map((s) => (
                    <th key={s.key} scope="col">
                      {s.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.code}>
                    <th scope="row">{r.name}</th>
                    <td>{r.waiting}</td>
                    <td>{r.serving}</td>
                    <td>{r.enrolled}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </Panel>
  );
}
