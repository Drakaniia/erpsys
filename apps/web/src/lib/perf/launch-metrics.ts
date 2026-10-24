/**
 * Launch measurement.
 *
 * The launch path is `boot → hydrated → session → launch → first-surface`.
 * Each mark is recorded once; the snapshot stays on `window.__erpsysLaunch`
 * so the manual procedure (and a future upload) reads one object instead of
 * reconstructing the timeline.
 *
 * This module must stay free of app imports: `main.tsx` calls it before the
 * router exists.
 */

export const APP_BUILD_ID =
  typeof __APP_BUILD_ID__ === "string" ? __APP_BUILD_ID__ : "dev";

export const LAUNCH_MARK_NAMES = [
  "boot",
  "hydrated",
  "session",
  "launch",
  "first-surface",
] as const;

export type LaunchMarkName = (typeof LAUNCH_MARK_NAMES)[number];

export type LaunchSnapshot = {
  buildId: string;
  /** True when no restored query data was available at boot. */
  cold: boolean;
  cacheRestored: boolean;
  sessionCached: boolean | null;
  launchCached: boolean | null;
  /** `performance.now()` at each mark, keyed by mark name. */
  marks: Partial<Record<LaunchMarkName, number>>;
  /** Core Web Vitals, keyed by metric name. */
  vitals: Record<string, number>;
};

declare global {
  interface Window {
    __erpsysLaunch?: LaunchSnapshot;
  }

  /** Injected by `vite.config.ts`. */
  const __APP_BUILD_ID__: string;
}

function freshSnapshot(): LaunchSnapshot {
  return {
    buildId: APP_BUILD_ID,
    cold: true,
    cacheRestored: false,
    sessionCached: null,
    launchCached: null,
    marks: {},
    vitals: {},
  };
}

function snapshot(): LaunchSnapshot {
  if (typeof window === "undefined") return freshSnapshot();
  window.__erpsysLaunch ??= freshSnapshot();
  return window.__erpsysLaunch;
}

function timeOriginNow(): number {
  return typeof performance !== "undefined" &&
    typeof performance.now === "function"
    ? performance.now()
    : Date.now();
}

export type LaunchMarkDetail = {
  cached?: boolean;
  [key: string]: unknown;
};

/** Record one launch mark. A repeated name is ignored, not overwritten. */
export function markLaunch(
  name: LaunchMarkName,
  detail?: LaunchMarkDetail,
): void {
  const state = snapshot();
  if (state.marks[name] !== undefined) return;
  state.marks[name] = timeOriginNow();
  if (
    typeof performance !== "undefined" &&
    typeof performance.mark === "function"
  ) {
    try {
      performance.mark(`erpsys:${name}`);
    } catch {
      /* marks are best-effort */
    }
  }
  if (name === "hydrated") {
    state.cacheRestored = detail?.cached === true;
    state.cold = !state.cacheRestored;
  }
  if (name === "session") state.sessionCached = detail?.cached === true;
  if (name === "launch") state.launchCached = detail?.cached === true;
}

export function readLaunchSnapshot(): LaunchSnapshot {
  return snapshot();
}

/** Stable JSON copy for tests and the manual measurement procedure. */
export function launchSnapshotJson(): string {
  return JSON.stringify(snapshot());
}

let initialized = false;

/**
 * First line of `main.tsx`: record `boot`, subscribe to the three vitals the
 * spec budgets, and (in development) print one table per launch.
 */
export function initLaunchMetrics(): void {
  if (initialized) return;
  initialized = true;
  markLaunch("boot");

  void import("web-vitals")
    .then(({ onCLS, onINP, onLCP }) => {
      const record = (name: string) => (metric: { value: number }) => {
        snapshot().vitals[name] = Math.round(metric.value * 1000) / 1000;
      };
      onLCP(record("lcp"));
      onINP(record("inp"));
      onCLS(record("cls"));
    })
    .catch(() => {
      /* measurement must never affect the launch */
    });

  if (import.meta.env.DEV && typeof window !== "undefined") {
    window.addEventListener("load", () => {
      window.setTimeout(() => {
        const state = snapshot();
        // eslint-disable-next-line no-console
        console.table({
          build: state.buildId,
          cold: state.cold,
          cacheRestored: state.cacheRestored,
          sessionCached: state.sessionCached,
          launchCached: state.launchCached,
          ...state.marks,
          ...state.vitals,
        });
      }, 0);
    });
  }
}

/** Test-only: forget the one-shot initialisation flag. */
export function resetLaunchMetricsForTest(): void {
  initialized = false;
}
