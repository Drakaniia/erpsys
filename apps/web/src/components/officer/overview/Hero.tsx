import type { CSSProperties } from "react";
import {
  AreaSparkline,
  BarSparkline,
  useSparklineHover,
} from "@/components/charts/sparkline";
import {
  headline,
  percent,
  trendPoints,
  type OfficerOverview,
} from "$lib/officer/overview";
import type { OfficerTab } from "$lib/officer/tabs";
import Skeleton from "../../ui/Skeleton";
import { AWAITING, AWAITING_INK, RETURNED, VERIFIED, dayFormat } from "./palette";

type Point = ReturnType<typeof trendPoints>[number];
type SeriesKey = "submitted" | "verified" | "returned";

function HeroSkeleton() {
  return (
    <div className="flex flex-col gap-3 py-2" aria-hidden="true">
      <Skeleton h="2rem" w="min(36rem, 92%)" radius="0.5rem" />
      <Skeleton h="2rem" w="min(26rem, 70%)" radius="0.5rem" index={1} />
      <Skeleton h="6.5rem" w="100%" radius="1rem" index={2} className="mt-5" />
    </div>
  );
}

function SeriesFigure({
  label,
  value,
  points,
  dataKey,
  color,
  verb,
  bars = false,
}: {
  label: string;
  value: number;
  points: Point[];
  dataKey: SeriesKey;
  color: string;
  verb: string;
  bars?: boolean;
}) {
  const hover = useSparklineHover<Point>();
  const total = points.reduce((n, p) => n + p[dataKey], 0);
  const caption = hover.datum
    ? `${dayFormat.format(hover.datum.date)}: ${hover.datum[dataKey].toLocaleString()} ${verb}`
    : `${total.toLocaleString()} ${verb} in the last 14 days`;

  return (
    <div className="flex min-w-0 flex-col gap-2 px-4 py-4 sm:px-5">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="text-[1.625rem] font-semibold leading-none tracking-[-0.03em] text-ink tabular-nums">
        {value.toLocaleString()}
      </dd>
      {points.length > 0 && (
        <dd className="mt-auto flex flex-col gap-1">
          {bars ? (
            <BarSparkline
              data={points}
              dataKey={dataKey}
              color={color}
              height={30}
              barGap={2}
              barRadius={1.5}
              {...hover.sparklineProps}
            />
          ) : (
            <AreaSparkline
              data={points}
              dataKey={dataKey}
              color={color}
              height={30}
              fillOpacity={0.22}
              strokeWidth={1.75}
              {...hover.sparklineProps}
            />
          )}
          <span className="truncate text-[11px] text-muted tabular-nums" aria-live="polite">
            {caption}
          </span>
        </dd>
      )}
    </div>
  );
}

function ClearedFigure({ cleared, started }: { cleared: number; started: number }) {
  const share = percent(cleared, started);
  return (
    <div className="flex min-w-0 flex-col gap-2 px-4 py-4 sm:px-5">
      <dt className="text-xs text-muted">Fully cleared</dt>
      <dd className="text-[1.625rem] font-semibold leading-none tracking-[-0.03em] text-ink tabular-nums">
        {cleared.toLocaleString()}
        <span className="ml-1.5 text-sm font-medium tracking-normal text-muted">
          {share}%
        </span>
      </dd>
      <dd className="mt-auto flex flex-col gap-1">
        <div
          className="h-[30px] py-[13px]"
          role="meter"
          aria-label="Students through every step"
          aria-valuemin={0}
          aria-valuemax={started}
          aria-valuenow={cleared}
        >
          <div className="h-1 overflow-hidden rounded-full bg-ink/[0.07]">
            <div
              className="oo-bar h-full rounded-full"
              style={{ width: `${share}%`, backgroundColor: VERIFIED }}
            />
          </div>
        </div>
        <span className="truncate text-[11px] text-muted tabular-nums">
          of {started.toLocaleString()} {started === 1 ? "student" : "students"} who started
        </span>
      </dd>
    </div>
  );
}

export function Hero({
  model,
  onopenstep,
}: {
  model: OfficerOverview | null;
  onopenstep: (tab: OfficerTab) => void;
}) {
  if (!model) return <HeroSkeleton />;

  const { lead, follow } = headline(model);
  const points = trendPoints(model);
  const start =
    model.totals.awaitingReview > 0
      ? (model.longestWait ??
        [...model.steps].sort((a, b) => b.awaitingReview - a.awaitingReview)[0])
      : null;
  const [count, ...rest] = lead.split(" ");
  const leadIsCount = /^\d[\d,]*$/.test(count ?? "");

  return (
    <div className="flex flex-col gap-6 pt-2">
      <div
        className="oo-rise flex flex-col items-start gap-5 lg:flex-row lg:items-end lg:justify-between"
        style={{ "--oo-i": 0 } as CSSProperties}
      >
        <p className="max-w-[44rem] text-balance text-[1.75rem] font-semibold leading-[1.14] tracking-[-0.03em] text-ink sm:text-[2.125rem]">
          {leadIsCount ? (
            <>
              <span className="tabular-nums" style={{ color: AWAITING_INK }}>
                {count}
              </span>{" "}
              {rest.join(" ")}
            </>
          ) : (
            lead
          )}{" "}
          <span className="text-muted">{follow}</span>
        </p>
        {start && (
          <button
            type="button"
            onClick={() => onopenstep(start.tab)}
            className="oo-press shrink-0 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-primary-soft"
          >
            Review {start.name}
          </button>
        )}
      </div>

      <dl
        className="oo-rise oo-ledger grid grid-cols-2 overflow-hidden rounded-2xl border border-border bg-surface-raised md:grid-flow-col md:auto-cols-fr md:grid-cols-none"
        style={{ "--oo-i": 1 } as CSSProperties}
      >
        <SeriesFigure
          label="Awaiting your review"
          value={model.totals.awaitingReview}
          points={points}
          dataKey="submitted"
          color={AWAITING}
          verb="submitted"
          bars
        />
        <SeriesFigure
          label="Verified this term"
          value={model.totals.verified}
          points={points}
          dataKey="verified"
          color={VERIFIED}
          verb="verified"
        />
        <SeriesFigure
          label="Returned to students"
          value={model.totals.returned}
          points={points}
          dataKey="returned"
          color={RETURNED}
          verb="returned"
        />
        {model.students && (
          <ClearedFigure
            cleared={model.students.cleared}
            started={model.students.started}
          />
        )}
      </dl>
    </div>
  );
}
