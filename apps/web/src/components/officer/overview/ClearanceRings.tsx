import { useMemo, useState } from "react";
import { Ring } from "@/components/charts/ring";
import { RingChart } from "@/components/charts/ring-chart";
import { percent, type OfficerOverview } from "$lib/officer/overview";
import Skeleton from "../../ui/Skeleton";
import { Panel, PanelQuiet } from "./Panel";
import { ringShade } from "./palette";

type RingRow = {
  code: string;
  label: string;
  name: string;
  value: number;
  maxValue: number;
  color: string;
};

/**
 * Rings run from step 1 on the outside to the last step nearest the center,
 * so the eye follows students inward to the count that made it all the way.
 * The ring chart draws index 0 innermost, hence the reversal.
 */
function ringRows(model: OfficerOverview): RingRow[] {
  const steps = model.steps;
  return [...steps].reverse().map((step, i) => {
    const max = model.students?.started ?? step.verified + step.unverified;
    return {
      code: step.code,
      label: step.name,
      name: step.name,
      value: step.verified,
      maxValue: Math.max(1, max),
      color: ringShade(steps.length - 1 - i, steps.length),
    };
  });
}

export function ClearanceRings({
  model,
  index,
}: {
  model: OfficerOverview | null;
  index: number;
}) {
  const [hovered, setHovered] = useState<number | null>(null);
  const signature = model
    ? JSON.stringify([
        model.students,
        model.steps.map((s) => [s.code, s.verified, s.unverified]),
      ])
    : "";
  // Polling hands us a fresh object every 20s; keep the ring data identity
  // stable until a number actually changes so the rings don't re-enter.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const rows = useMemo(() => (model ? ringRows(model) : []), [signature]);

  const started = model?.students?.started ?? null;
  const cleared = model?.students?.cleared ?? 0;
  const anything = rows.some((r) => r.value > 0) || (started ?? 0) > 0;
  const active = hovered === null ? null : rows[hovered];
  const legend = [...rows].reverse();

  return (
    <Panel
      title="How far students have cleared"
      description={
        started !== null
          ? `Of the ${started.toLocaleString()} ${started === 1 ? "student" : "students"} who've started, the share verified at each step.`
          : "Share of each step's submissions you've verified this term."
      }
      index={index}
    >
      {!model ? (
        <div className="flex flex-col items-center gap-5" aria-hidden="true">
          <Skeleton h="15rem" w="15rem" radius="9999px" />
          <Skeleton h="5rem" w="100%" radius="0.75rem" index={1} />
        </div>
      ) : !anything ? (
        <PanelQuiet>
          No step has been verified yet this term. The rings fill as you
          verify submissions, step by step.
        </PanelQuiet>
      ) : (
        <div className="flex flex-1 flex-col gap-4">
          <div className="relative mx-auto w-full max-w-[17.5rem]">
            <RingChart
              data={rows}
              strokeWidth={13}
              ringGap={5}
              baseInnerRadius={58}
              startAngle={-Math.PI}
              endAngle={Math.PI / 2}
              hoveredIndex={hovered}
              onHoverChange={setHovered}
            >
              {rows.map((row, i) => (
                <Ring key={row.code} index={i} showGlow={false} />
              ))}
            </RingChart>
            <div
              className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center"
              aria-live="polite"
            >
              {active ? (
                <>
                  <span className="text-2xl font-semibold leading-none tracking-tight text-ink tabular-nums">
                    {percent(active.value, active.maxValue)}%
                  </span>
                  <span className="mt-1 max-w-[6.5rem] text-[11px] leading-tight text-muted">
                    {active.name}
                  </span>
                </>
              ) : started !== null ? (
                <>
                  <span className="text-[1.75rem] font-semibold leading-none tracking-tight text-ink tabular-nums">
                    {cleared.toLocaleString()}
                  </span>
                  <span className="mt-1 max-w-[6.5rem] text-[11px] leading-tight text-muted">
                    fully cleared
                  </span>
                </>
              ) : null}
            </div>
          </div>

          <ul className="mt-auto grid grid-cols-1 gap-x-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
            {legend.map((row) => {
              const i = rows.indexOf(row);
              return (
                <li
                  key={row.code}
                  onPointerEnter={() => setHovered(i)}
                  onPointerLeave={() => setHovered(null)}
                  className={`flex items-center gap-2 border-t border-border py-1.5 text-xs transition-opacity duration-150 ${
                    hovered !== null && hovered !== i ? "opacity-45" : ""
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className="size-2 shrink-0 rounded-[3px]"
                    style={{ backgroundColor: row.color }}
                  />
                  <span className="min-w-0 flex-1 truncate text-ink">{row.label}</span>
                  <span className="text-muted tabular-nums">
                    {row.value.toLocaleString()}
                  </span>
                  <span className="w-9 text-right font-semibold text-ink tabular-nums">
                    {percent(row.value, row.maxValue)}%
                  </span>
                </li>
              );
            })}
          </ul>
          <table className="sr-only">
            <caption>Students verified at each clearance step</caption>
            <thead>
              <tr>
                <th scope="col">Step</th>
                <th scope="col">Verified</th>
                <th scope="col">Out of</th>
              </tr>
            </thead>
            <tbody>
              {legend.map((row) => (
                <tr key={row.code}>
                  <th scope="row">{row.name}</th>
                  <td>{row.value}</td>
                  <td>{row.maxValue}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}
