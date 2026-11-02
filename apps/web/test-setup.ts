import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(() => cleanup());

if (typeof window !== "undefined" && typeof window.matchMedia !== "function") {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

if (
  typeof Element !== "undefined" &&
  typeof Element.prototype.animate !== "function"
) {
  class MockAnimation {
    playState = "finished";
    currentTime = 0;
    startTime = 0;
    effect = { getTiming: () => ({ delay: 0, duration: 0, easing: "linear" }) };
    finished: Promise<this>;
    oncancel: (() => void) | null = null;
    onfinish: (() => void) | null = null;

    constructor() {
      this.finished = Promise.resolve(this);
    }

    cancel(): void {
      this.playState = "idle";
      this.oncancel?.();
    }

    finish(): void {
      this.playState = "finished";
      this.onfinish?.();
    }

    pause(): void {}
    play(): void {}
    reverse(): void {}
    persist(): void {}
    commitStyles(): void {}
    addEventListener(): void {}
    removeEventListener(): void {}
  }

  Element.prototype.animate = function animate() {
    return new MockAnimation() as unknown as Animation;
  } as typeof Element.prototype.animate;
}
