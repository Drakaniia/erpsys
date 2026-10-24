import Skeleton from "./Skeleton";

/**
 * A short paragraph of placeholder lines. The last line is deliberately
 * shorter so the block reads as prose rather than as a stack of bars.
 */
export default function SkeletonText({
  lines = 3,
  index = 0,
  className = "",
}: {
  lines?: number;
  index?: number;
  className?: string;
}) {
  const widths = ["100%", "92%", "64%"];
  return (
    <div className={`space-y-2 ${className}`} aria-hidden="true">
      {Array.from({ length: lines }, (_, i) => i).map((i) => (
        <Skeleton
          key={i}
          h="0.75rem"
          w={widths[i % widths.length]}
          index={index + i}
        />
      ))}
    </div>
  );
}
