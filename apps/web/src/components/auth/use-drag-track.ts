import { useEffect, useRef, useState } from "react";
import { UI_SPRING, prefersReducedMotion } from "$lib/motion";
import { useSpring } from "$lib/ui/use-spring";
import {
  SWIPE_AXIS_LOCK_PX,
  clampDragPx,
  resolveSwipeStep,
  stepOffset,
  type CourseYearStep,
} from "$lib/ui/course-year-swipe";

/**
 * The two-page swipe track for the course/year picker: the spring position,
 * the pointer/axis-lock physics, the page measurement, and the focus target the
 * next step should land on.
 *
 * One spring drives the track for every path into a step - clicking a course,
 * clicking Back, the arrow key, and dragging all set the same target. A CSS
 * transition had to be toggled to `none` mid-drag, and that interaction is what
 * left the click path visibly un-animated. The position is in pixels because
 * the track is two pages wide, so a percentage would resolve against the track
 * and overshoot.
 */
export function useDragTrack({
  open,
  hasPicked,
}: {
  open: boolean;
  /** Whether a course has been chosen (step 2 is reachable). */
  hasPicked: boolean;
}) {
  const [step, setStep] = useState<CourseYearStep>(1);
  const [pageWidth, setPageWidth] = useState(0);
  const [isScrolling, setIsScrolling] = useState(false);
  const [trackX, setTrackX] = useSpring(0, UI_SPRING);

  const reduceMotion = prefersReducedMotion();

  const dragging = useRef(false);
  const pointerStartX = useRef(0);
  const pointerStartY = useRef(0);
  const axisLocked = useRef<"x" | "y" | null>(null);

  const viewportEl = useRef<HTMLDivElement | null>(null);
  const scrollTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const focusAfterStep = useRef<"search" | "levels" | null>(null);

  function measure() {
    setPageWidth(viewportEl.current?.offsetWidth ?? 0);
  }

  function goToStep(next: CourseYearStep, hard = false) {
    setStep(next);
    focusAfterStep.current = next === 2 ? "levels" : "search";
    const target = stepOffset(next, pageWidth);
    if (hard || reduceMotion) setTrackX(target, true);
    else setTrackX(target);
  }

  /** Park on step 1 without animating, ready for the next open. */
  function prepareOpen() {
    focusAfterStep.current = "search";
    setStep(1);
    setTrackX(0, true);
  }

  function stopDrag() {
    dragging.current = false;
    axisLocked.current = null;
  }

  function onListScroll() {
    setIsScrolling(true);
    if (scrollTimer.current) clearTimeout(scrollTimer.current);
    scrollTimer.current = setTimeout(() => setIsScrolling(false), 700);
  }

  function onPointerDown(event: React.PointerEvent) {
    if (event.button !== 0) return;
    const canAdvance = step === 1 && hasPicked;
    const canGoBack = step === 2;
    if (!canAdvance && !canGoBack) return;
    dragging.current = true;
    axisLocked.current = null;
    pointerStartX.current = event.clientX;
    pointerStartY.current = event.clientY;
  }

  function onPointerMove(event: React.PointerEvent) {
    if (!dragging.current) return;
    const dx = event.clientX - pointerStartX.current;
    const dy = event.clientY - pointerStartY.current;
    if (!axisLocked.current) {
      if (
        Math.abs(dx) < SWIPE_AXIS_LOCK_PX &&
        Math.abs(dy) < SWIPE_AXIS_LOCK_PX
      )
        return;
      axisLocked.current = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
    }
    if (axisLocked.current !== "x") return;
    // Hard-set so the track stays glued to the finger; the spring is
    // only released on pointer up, where it carries the velocity.
    setTrackX(
      clampDragPx(stepOffset(step, pageWidth) + dx, step, pageWidth),
      true,
    );
  }

  function endDrag() {
    if (!dragging.current) return;
    dragging.current = false;
    const axis = axisLocked.current;
    axisLocked.current = null;
    const dx = trackX - stepOffset(step, pageWidth);
    const next = resolveSwipeStep({
      dx,
      axis,
      step,
      hasPicked,
      pageWidth,
    });
    // A vertical drag leaves `dx` meaningless, so the resolved step is
    // the current one and this simply springs back to rest.
    goToStep(next);
  }

  // The panel mounts after `open`, so the page width is measured then and the
  // track is parked without animating.
  useEffect(
    () => () => {
      if (scrollTimer.current) clearTimeout(scrollTimer.current);
    },
    [],
  );

  useEffect(() => {
    if (!open) return;
    measure();
    setTrackX(stepOffset(1, viewportEl.current?.offsetWidth ?? 0), true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  /**
   * Only a width change moves the page boundary and therefore invalidates the
   * current offset. The viewport's *height* changes every time the steps swap,
   * so reacting to it would hard-set the track onto its destination on the very
   * frame the slide starts - which reads as no animation at all.
   */
  useEffect(() => {
    const el = viewportEl.current;
    if (!open || !el) return;
    if (typeof ResizeObserver === "undefined") return;
    let lastWidth = Math.round(el.offsetWidth);
    const observer = new ResizeObserver((entries) => {
      const width = Math.round(entries[0]?.contentRect.width ?? el.offsetWidth);
      if (width === lastWidth) return;
      lastWidth = width;
      setPageWidth(width);
      if (dragging.current) return;
      // Glide to the corrected offset rather than snapping, so a resize
      // landing mid-slide never reads as a jump.
      setTrackX(stepOffset(step, width));
    });
    observer.observe(el);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, step]);

  return {
    step,
    trackX,
    isScrolling,
    viewportEl,
    focusAfterStep,
    goToStep,
    prepareOpen,
    stopDrag,
    onListScroll,
    onPointerDown,
    onPointerMove,
    onPointerUp: endDrag,
    onPointerCancel: endDrag,
  };
}
