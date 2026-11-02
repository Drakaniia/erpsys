export const UI_SPRING = { stiffness: 0.18, damping: 0.84 } as const;

export const SHEET_SPRING = { stiffness: 0.3, damping: 0.87 } as const;

export function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

export function rubberband(
  overshoot: number,
  dimension: number,
  constant = 0.55,
): number {
  return (
    (overshoot * dimension * constant) /
    (dimension + constant * Math.abs(overshoot))
  );
}

export function project(
  initialVelocity: number,
  decelerationRate = 0.998,
): number {
  return ((initialVelocity / 1000) * decelerationRate) / (1 - decelerationRate);
}
