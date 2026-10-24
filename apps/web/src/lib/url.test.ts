import { beforeEach, describe, expect, it } from "vitest";
import { updateUrl } from "./url";

describe("updateUrl", () => {
  beforeEach(() => {
    window.history.replaceState(window.history.state, "", "/instructor?dept=a");
  });

  it("sets params and replaces history by default", () => {
    updateUrl({ dept: "b", view: "enrolled" });
    const url = new URL(window.location.href);
    expect(url.searchParams.get("dept")).toBe("b");
    expect(url.searchParams.get("view")).toBe("enrolled");
  });

  it("deletes params passed as null and keeps the rest", () => {
    window.history.replaceState(
      window.history.state,
      "",
      "/instructor?dept=a&tab=students",
    );
    updateUrl({ dept: null });
    const url = new URL(window.location.href);
    expect(url.searchParams.has("dept")).toBe(false);
    expect(url.searchParams.get("tab")).toBe("students");
  });

  it("pushes history when replace is false", () => {
    const before = window.history.length;
    updateUrl({ q: "x" }, false);
    expect(new URL(window.location.href).searchParams.get("q")).toBe("x");
    expect(window.history.length).toBeGreaterThanOrEqual(before);
  });
});
