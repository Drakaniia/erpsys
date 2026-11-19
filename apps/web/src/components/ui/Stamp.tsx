import type { CSSProperties, ReactNode } from "react";

const stampShadow =
  "drop-shadow(0 1px 1px rgb(15 15 15 / 12%)) drop-shadow(0 12px 22px rgb(15 15 15 / 9%))";
const stampBackground =
  "linear-gradient(145deg, rgb(255 255 255 / 34%), transparent 42%), var(--stamp-paper)";

type StampCustomProperty = "--stamp-ink" | "--stamp-padding" | "--stamp-paper";
type StampRootStyle = CSSProperties &
  Partial<Record<StampCustomProperty, string>>;
type CssLength = number | string;

export type StampProps = {
  /** Any React content rendered inside the perforated paper frame. */
  children: ReactNode;
  "aria-hidden"?: boolean;
  "aria-label"?: string;
  className?: string;
  contentClassName?: string;
  horizontalPerforations?: number;
  ink?: string;
  padding?: CssLength;
  paper?: string;
  perforationDepth?: number;
  stampClassName?: string;
  style?: CSSProperties;
  verticalPerforations?: number;
};

function toCssLength(value: CssLength) {
  return typeof value === "number" ? `${value}px` : value;
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum);
}

function createStampClipPath({
  depth,
  horizontalCount,
  verticalCount,
}: {
  depth: number;
  horizontalCount: number;
  verticalCount: number;
}) {
  const resolvedDepth = clamp(depth, 0, 10);
  const resolvedHorizontalCount = clamp(Math.round(horizontalCount), 4, 32);
  const resolvedVerticalCount = clamp(Math.round(verticalCount), 4, 40);
  const horizontalStep = 100 / resolvedHorizontalCount;
  const verticalStep = 100 / resolvedVerticalCount;
  const points: Array<[number, number]> = [[0, 0]];
  for (let index = 0; index < resolvedHorizontalCount; index += 1) {
    const start = index * horizontalStep;
    points.push([start + horizontalStep * 0.25, 0]);
    points.push([start + horizontalStep * 0.5, resolvedDepth]);
    points.push([start + horizontalStep * 0.75, 0]);
    points.push([start + horizontalStep, 0]);
  }
  for (let index = 0; index < resolvedVerticalCount; index += 1) {
    const start = index * verticalStep;
    points.push([100, start + verticalStep * 0.25]);
    points.push([100 - resolvedDepth, start + verticalStep * 0.5]);
    points.push([100, start + verticalStep * 0.75]);
    points.push([100, start + verticalStep]);
  }
  for (let index = 0; index < resolvedHorizontalCount; index += 1) {
    const start = 100 - index * horizontalStep;
    points.push([start - horizontalStep * 0.25, 100]);
    points.push([start - horizontalStep * 0.5, 100 - resolvedDepth]);
    points.push([start - horizontalStep * 0.75, 100]);
    points.push([start - horizontalStep, 100]);
  }
  for (let index = 0; index < resolvedVerticalCount; index += 1) {
    const start = 100 - index * verticalStep;
    points.push([0, start - verticalStep * 0.25]);
    points.push([resolvedDepth, start - verticalStep * 0.5]);
    points.push([0, start - verticalStep * 0.75]);
    points.push([0, start - verticalStep]);
  }
  return `polygon(${points
    .map(([x, y]) => `${x.toFixed(3)}% ${y.toFixed(3)}%`)
    .join(", ")})`;
}

export default function Stamp({
  "aria-hidden": ariaHidden,
  "aria-label": ariaLabel,
  children,
  className,
  contentClassName,
  horizontalPerforations = 15,
  ink = "#181713",
  padding = 10,
  paper = "#ffffff",
  perforationDepth = 2.4,
  stampClassName,
  style,
  verticalPerforations = 9,
}: StampProps) {
  const clipPath = createStampClipPath({
    depth: perforationDepth,
    horizontalCount: horizontalPerforations,
    verticalCount: verticalPerforations,
  });
  const rootStyle: StampRootStyle = {
    "--stamp-ink": ink,
    "--stamp-padding": toCssLength(padding),
    "--stamp-paper": paper,
    filter: stampShadow,
    ...style,
  };
  return (
    <div
      className={`relative aspect-[8/5] w-[min(100%,18rem)] -rotate-6 ${className ?? ""}`}
      style={rootStyle}
    >
      <article
        aria-hidden={ariaHidden}
        aria-label={ariaHidden ? undefined : ariaLabel}
        className={`relative size-full overflow-hidden p-[var(--stamp-padding)] text-[var(--stamp-ink)] ${stampClassName ?? ""}`}
        style={{ background: stampBackground, clipPath }}
      >
        <div
          className={`relative size-full min-h-0 min-w-0 overflow-hidden ${contentClassName ?? ""}`}
        >
          {children}
        </div>
      </article>
    </div>
  );
}
