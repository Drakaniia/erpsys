import { Area, AreaChart } from "@/components/charts/area-chart";
import { Grid } from "@/components/charts/grid";
import { XAxis } from "@/components/charts/x-axis";
import { ChartTooltip } from "@/components/charts/tooltip/chart-tooltip";
import { trendPoints, type AdminOverview } from "$lib/admin/overview";
import { Panel, PanelEmpty } from "./Panel";

const JOINED = "var(--chart-2)";
const COMPLETED = "var(--chart-1)";

const dayFmt = new Intl.DateTimeFormat(undefined, {
  weekday: "short",
  month: "short",
  day: "numeric",
});

function Key({ color, label, total }: { color: string; label: string; total: number }) {
  return (
    <span className="flex items-center gap-2 text-xs text-muted">
      <span className="size-2 rounded-full" style={{ backgroundColor: color }} />
      {label}
      <span className="font-semibold tabular-nums text-ink">{total.toLocaleString()}</span>
    </span>
  );
}

export function QueueMovement({
  data,
  index,
}: {
  data: AdminOverview | undefined;
  index: number;
}) {
  const points = data ? trendPoints(data) : [];
  const joined = points.reduce((n, p) => n + p.joined, 0);
  const completed = points.reduce((n, p) => n + p.completed, 0);
  const loading = !data;
  const quiet = !loading && joined === 0 && completed === 0;

  return (
    <Panel
      title="Is the line moving?"
      description="Students joining an enrollment line and finishing it, per day over the last 14 days."
      index={index}
    >
      {quiet ? (
        <PanelEmpty>
          No one has joined or finished an enrollment line in the last 14 days.
          Daily movement shows here once advisers open their lines.
        </PanelEmpty>
      ) : (
        <>
          {!loading && (
            <div className="flex flex-wrap gap-x-5 gap-y-1">
              <Key color={JOINED} label="Joined a line" total={joined} />
              <Key color={COMPLETED} label="Finished enrollment" total={completed} />
            </div>
          )}
          <AreaChart
            data={points}
            status={loading ? "loading" : "ready"}
            loadingLabel="Loading queue activity…"
            aspectRatio="2.4 / 1"
            margin={{ top: 24, right: 12, bottom: 32, left: 12 }}
          >
            <Grid horizontal numTicksRows={4} />
            <Area
              dataKey="joined"
              fill={JOINED}
              fillOpacity={0.22}
              strokeWidth={1.75}
            />
            <Area
              dataKey="completed"
              fill={COMPLETED}
              fillOpacity={0.3}
              strokeWidth={2}
            />
            <XAxis numTicks={{ base: 4, md: 7 }} />
            <ChartTooltip
              rows={(point) => [
                { color: JOINED, label: "Joined a line", value: Number(point.joined ?? 0) },
                {
                  color: COMPLETED,
                  label: "Finished enrollment",
                  value: Number(point.completed ?? 0),
                },
              ]}
            />
          </AreaChart>
          {!loading && (
            <table className="sr-only">
              <caption>Enrollment line movement, last 14 days</caption>
              <thead>
                <tr>
                  <th scope="col">Day</th>
                  <th scope="col">Joined</th>
                  <th scope="col">Finished</th>
                </tr>
              </thead>
              <tbody>
                {points.map((p) => (
                  <tr key={p.date.toISOString()}>
                    <th scope="row">{dayFmt.format(p.date)}</th>
                    <td>{p.joined}</td>
                    <td>{p.completed}</td>
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
