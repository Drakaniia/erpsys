import { describe, expect, it } from "vitest";
import { background, drainBackgroundTasks, withBackgroundTasks } from "../../../src/lib/platform/background.js";

describe("request background lifetime", () => {
  it("drains nested work before database cleanup", async () => {
    const pending = new Set<Promise<unknown>>();
    const completed: number[] = [];
    await withBackgroundTasks(pending, async () => {
      background(Promise.resolve().then(() => {
        completed.push(1);
        background(new Promise<void>((resolve) => setTimeout(() => { completed.push(2); resolve(); }, 5)));
      }));
      await drainBackgroundTasks(pending);
    });
    expect(completed).toEqual([1, 2]);
    expect(pending.size).toBe(0);
  });

  it("isolates overlapping requests and handles rejected tasks", async () => {
    const first = new Set<Promise<unknown>>();
    const second = new Set<Promise<unknown>>();
    await Promise.all([first, second].map((pending) => withBackgroundTasks(pending, async () => {
      background(Promise.reject(new Error("expected")));
      expect(pending.size).toBe(1);
      await drainBackgroundTasks(pending);
      expect(pending.size).toBe(0);
    })));
  });
});
