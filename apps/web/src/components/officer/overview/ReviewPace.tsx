import { useMemo } from "react";
import { Area, AreaChart } from "@/components/charts/area-chart";
import { Grid } from "@/components/charts/grid";
import { ChartTooltip } from "@/components/charts/tooltip/chart-tooltip";
import { XAxis } from "@/components/charts/x-axis";
import { trendPoints, type OfficerOverview } from "$lib/officer/overview";
import { Key, Panel, PanelQuiet } from "./Panel";
import { AWAITING, RETURNED, VERIFIED, dayFormat } from "./palette";

export function ReviewPace({
  model,
  index,
}: {
  model: OfficerOverview | null;
  index: number;
}) {
  const signature = model ? JSON.stringify(model.trend) : "";
  // Same reasoning as the rings: only hand the chart new data when a day's
  // count changes, so a 20s poll doesn't replay the enter animation.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const points = useMemo(() => (model ? trendPoints(model) : []), [signature]);
  const totals = points.reduce(
    (acc, p) => ({
      submitted: acc.submitted + p.submitted,
      verified: acc.verified + p.verified,
      returned: acc.returned + p.returned,
    }),
    { submitted: 0, verified: 0, returned: 0 },
  );
  const loading = !model;
  const noSeries = !!model && points.length === 0;
  const quiet =
    !!model && points.length > 0 && totals.submitted + totals.verified + totals.returned === 0;
  const decided = totals.verified + totals.returned;
  const verdict =
    totals.submitted === 0
      ? null
      : decided >= totals.submitted
        ? "You decided as many as arrived."
        : `${(totals.submitted - decided).toLocaleString()} more arrived than you decided.`;

  return (
    <Panel
      title="Are reviews keeping up?"
      description="Submissions arriving against your verifications, per day over the last 14 days."
      aside={
        verdict ? (
          <span className="hidden shrink-0 text-right text-xs font-medium text-ink sm:block">
            {verdict}
          </span>
        ) : null
      }
      index={index}
    >
      {noSeries ? (
        <PanelQuiet>
          Daily review pace isn't available for this account. Officers see
          submissions and decisions per day here.
        </PanelQuiet>
      ) : quiet ? (
        <PanelQuiet>
          Nothing was submitted or decided in the last 14 days. The daily pace
          shows here once students start submitting steps.
        </PanelQuiet>
      ) : (
        <>
          {!loading && (
            <div className="flex flex-wrap gap-x-5 gap-y-1">
              <Key color={AWAITING} label="Submitted" value={totals.submitted} />
              <Key color={VERIFIED} label="Verified" value={totals.verified} />
              <Key color={RETURNED} label="Returned" value={totals.returned} />
            </div>
          )}
          <AreaChart
            data={points}
            status={loading ? "loading" : "ready"}
            loadingLabel="Loading review pace…"
            aspectRatio="2.6 / 1"
            className="min-h-52"
            margin={{ top: 24, right: 12, bottom: 32, left: 12 }}
          >
            <Grid horizontal numTicksRows={4} />
            <Area dataKey="submitted" fill={AWAITING} fillOpacity={0.2} strokeWidth={1.75} />
            <Area dataKey="verified" fill={VERIFIED} fillOpacity={0.28} strokeWidth={2} />
            <Area dataKey="returned" fill={RETURNED} fillOpacity={0.14} strokeWidth={1.5} />
            <XAxis numTicks={{ base: 4, md: 7 }} />
            <ChartTooltip
              rows={(point) => [
                { color: AWAITING, label: "Submitted", value: Number(point.submitted ?? 0) },
                { color: VERIFIED, label: "Verified", value: Number(point.verified ?? 0) },
                { color: RETURNED, label: "Returned", value: Number(point.returned ?? 0) },
              ]}
            />
          </AreaChart>
          {!loading && (
            <table className="sr-only">
              <caption>Submissions and decisions per day, last 14 days</caption>
              <thead>
                <tr>
                  <th scope="col">Day</th>
                  <th scope="col">Submitted</th>
                  <th scope="col">Verified</th>
                  <th scope="col">Returned</th>
                </tr>
              </thead>
              <tbody>
                {points.map((p) => (
                  <tr key={p.date.toISOString()}>
                    <th scope="row">{dayFormat.format(p.date)}</th>
                    <td>{p.submitted}</td>
                    <td>{p.verified}</td>
                    <td>{p.returned}</td>
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
