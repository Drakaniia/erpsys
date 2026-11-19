import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  markLaunch,
  readLaunchSnapshot,
  resetLaunchMetricsForTest,
} from "./launch-metrics";

beforeEach(() => {
  delete window.__erpsysLaunch;
  resetLaunchMetricsForTest();
  vi.restoreAllMocks();
});

describe("markLaunch", () => {
  it("records each mark once", () => {
    markLaunch("boot");
    const first = readLaunchSnapshot().marks.boot;
    markLaunch("boot");
    expect(readLaunchSnapshot().marks.boot).toBe(first);
    expect(typeof first).toBe("number");
  });

  it("records a performance mark with the erpsys prefix", () => {
    const spy = vi.spyOn(performance, "mark");
    markLaunch("hydrated", { cached: true });
    expect(spy).toHaveBeenCalledWith("erpsys:hydrated");
  });
});

describe("snapshot", () => {
  it("starts cold with no cached flags", () => {
    const snapshot = readLaunchSnapshot();
    expect(snapshot.cold).toBe(true);
    expect(snapshot.cacheRestored).toBe(false);
    expect(snapshot.sessionCached).toBeNull();
    expect(snapshot.launchCached).toBeNull();
    expect(snapshot.marks).toEqual({});
    expect(snapshot.vitals).toEqual({});
  });

  it("flips to warm when the restore found entries", () => {
    markLaunch("hydrated", { cached: true });
    const snapshot = readLaunchSnapshot();
    expect(snapshot.cold).toBe(false);
    expect(snapshot.cacheRestored).toBe(true);
  });

  it("records cached flags for the session and launch marks", () => {
    markLaunch("session", { cached: true });
    markLaunch("launch", { cached: false });
    const snapshot = readLaunchSnapshot();
    expect(snapshot.sessionCached).toBe(true);
    expect(snapshot.launchCached).toBe(false);
  });
});
