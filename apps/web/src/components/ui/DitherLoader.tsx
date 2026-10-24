const BAYER_4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

export default function DitherLoader({
  size = "md",
  speed = 1,
  className = "",
}: {
  size?: "sm" | "md" | "lg";
  speed?: number;
  className?: string;
}) {
  const px = { sm: 20, md: 28, lg: 40 } as const;
  const dimension = px[size];
  const gap = Math.max(1, dimension * 0.05);
  const cell = (dimension - gap * 3) / 4;
  return (
    <div
      className={`dither-loader shrink-0 ${className}`}
      style={{ gap: `${gap}px` }}
      aria-hidden="true"
    >
      {BAYER_4.map((order) => (
        <span
          key={order}
          className="dither-cell"
          style={{
            width: `${cell}px`,
            height: `${cell}px`,
            animationDuration: `${speed}s`,
            animationDelay: `${(order / BAYER_4.length) * speed}s`,
          }}
        />
      ))}
    </div>
  );
}
