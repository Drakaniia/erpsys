import { rubberband } from "$lib/motion";

/**
 * Pure geometry for the two-step course -> year level track.
 *
 * The track is two pages wide, so every value here is a measured
 * pixel distance rather than a percentage: a percentage on the track
 * would resolve against the track's own width (two pages) and
 * overshoot into blank space.
 */

export type CourseYearStep = 1 | 2;

type SwipeAxis = "x" | "y" | null;

/** How far the finger must travel before a drag commits to a step. */
export const SWIPE_COMMIT_PX = 48;

/** Pixels of movement before we decide whether a drag is a swipe or a scroll. */
export const SWIPE_AXIS_LOCK_PX = 6;

export function stepOffset(step: CourseYearStep, pageWidth: number): number {
  // A zero-width page has no second page to slide to, so the track
  // stays put rather than jumping to an unmeasurable offset.
  if (pageWidth <= 0) return 0;
  return step === 1 ? 0 : -pageWidth;
}

/** Rubber band the part of a pull that has run past `edge`. */
function past(edge: number, dx: number, pageWidth: number): number {
  return edge + rubberband(dx - edge, pageWidth);
}

/**
 * Where the track should sit mid-drag.
 *
 * Inside the available travel the track follows the finger 1:1. Past
 * the far edge, and on any pull in the direction that would leave the
 * track, it rubber bands instead of clamping flat — so the gesture
 * reads as "this is the end" and stays recoverable.
 */
export function clampDragPx(
  dx: number,
  step: CourseYearStep,
  pageWidth: number,
): number {
  if (pageWidth <= 0) return 0;
  if (step === 1) {
    if (dx < 0) return dx >= -pageWidth ? dx : past(-pageWidth, dx, pageWidth);
    return rubberband(dx, pageWidth);
  }
  if (dx > 0) return dx <= pageWidth ? dx : past(pageWidth, dx, pageWidth);
  return rubberband(dx, pageWidth);
}

/**
 * The step a finished drag should land on, or the current step when the
 * gesture should snap back.
 *
 * Callers set the track to `stepOffset` of the result, so a `null`-free
 * return here is deliberate: there is always a valid page to rest on.
 */
export function resolveSwipeStep({
  dx,
  axis,
  step,
  hasPicked,
  pageWidth,
}: {
  dx: number;
  axis: SwipeAxis;
  step: CourseYearStep;
  hasPicked: boolean;
  pageWidth: number;
}): CourseYearStep {
  if (pageWidth <= 0) return step;
  // A drag that locked onto the vertical axis was a list scroll, not a
  // swipe, so it must never flip the step.
  if (axis !== "x") return step;
  if (dx <= -SWIPE_COMMIT_PX && step === 1 && hasPicked) return 2;
  if (dx >= SWIPE_COMMIT_PX && step === 2) return 1;
  return step;
}
