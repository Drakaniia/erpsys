import type { CSSProperties } from "react";

/**
 * A single placeholder block. Shape comes from `h`/`w`/`radius`; the fill and
 * the light sweep come from the global `.skeleton` class.
 *
 * Pass `index` when rendering a list so the sweep cascades down the rows
 * instead of every row flashing at once.
 */
export default function Skeleton({
  h = "0.75rem",
  w = "100%",
  radius = "0.5rem",
  index,
  className = "",
}: {
  h?: string;
  w?: string;
  radius?: string;
  index?: number;
  className?: string;
}) {
  return (
    <div
      className={`skeleton ${className}`}
      style={
        {
          height: h,
          width: w,
          borderRadius: radius,
          ...(index === undefined ? {} : { "--skeleton-i": index }),
        } as CSSProperties
      }
      aria-hidden="true"
    />
  );
}
