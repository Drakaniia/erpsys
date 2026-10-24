import { describe, expect, it } from "vitest";
import {
  SWIPE_COMMIT_PX,
  clampDragPx,
  resolveSwipeStep,
  stepOffset,
} from "./course-year-swipe";

describe("stepOffset", () => {
  it("parks the year level step exactly one page to the left", () => {
    // The track is two pages wide, so the offset has to be a measured
    // pixel distance. A percentage would resolve against the track's
    // own width (two pages) and overshoot into blank space.
    expect(stepOffset(1, 320)).toBe(0);
    expect(stepOffset(2, 320)).toBe(-320);
  });

  it("treats a zero-width page as no offset so mount never divides by zero", () => {
    expect(stepOffset(2, 0)).toBe(0);
  });
});

describe("clampDragPx", () => {
  it("follows the finger inside the available travel", () => {
    expect(clampDragPx(-40, 1, 320)).toBe(-40);
    expect(clampDragPx(40, 2, 320)).toBe(40);
  });

  it("rubber bands past the far edge instead of stopping dead", () => {
    // Past the end of the track there is nowhere left to go, so the
    // movement should feel elastic and stay recoverable.
    const past = clampDragPx(-400, 1, 320);
    expect(past).toBeLessThan(-320);
    expect(past).toBeGreaterThan(-400);
  });

  it("resists a pull in the direction that would leave the track", () => {
    // Step 1 only travels left, so pulling right is resistance, not travel.
    const resisted = clampDragPx(200, 1, 320);
    expect(resisted).toBeGreaterThan(0);
    expect(resisted).toBeLessThan(200);

    const resistedBack = clampDragPx(-400, 2, 320);
    expect(resistedBack).toBeLessThan(0);
    expect(resistedBack).toBeGreaterThan(-400);
  });
});

describe("resolveSwipeStep", () => {
  it("ignores a drag that never locked onto the horizontal axis", () => {
    // A vertical scroll of the list must not flip the step.
    expect(
      resolveSwipeStep({
        dx: -200,
        axis: "y",
        step: 1,
        hasPicked: true,
        pageWidth: 320,
      }),
    ).toBe(1);
  });

  it("commits forward on a leftward drag past the threshold", () => {
    expect(
      resolveSwipeStep({
        dx: -SWIPE_COMMIT_PX,
        axis: "x",
        step: 1,
        hasPicked: true,
        pageWidth: 320,
      }),
    ).toBe(2);
  });

  it("commits back on a rightward drag past the threshold", () => {
    expect(
      resolveSwipeStep({
        dx: SWIPE_COMMIT_PX,
        axis: "x",
        step: 2,
        hasPicked: true,
        pageWidth: 320,
      }),
    ).toBe(1);
  });

  it("snaps back when the drag is under the threshold", () => {
    expect(
      resolveSwipeStep({
        dx: -SWIPE_COMMIT_PX + 1,
        axis: "x",
        step: 1,
        hasPicked: true,
        pageWidth: 320,
      }),
    ).toBe(1);
    expect(
      resolveSwipeStep({
        dx: SWIPE_COMMIT_PX - 1,
        axis: "x",
        step: 2,
        hasPicked: true,
        pageWidth: 320,
      }),
    ).toBe(2);
  });

  it("will not advance with nothing picked", () => {
    // Step 2 renders the year levels of a chosen course, so with no pick there is no second page to slide to.
    expect(
      resolveSwipeStep({
        dx: -200,
        axis: "x",
        step: 1,
        hasPicked: false,
        pageWidth: 320,
      }),
    ).toBe(1);
  });

  it("returns the current step for a zero-width page", () => {
    expect(
      resolveSwipeStep({
        dx: -200,
        axis: "x",
        step: 1,
        hasPicked: true,
        pageWidth: 0,
      }),
    ).toBe(1);
  });
});
