import { describe, expect, it } from "vitest";
import {
  buildR2FileKey,
  isR2FileKey,
  parseR2FileKey,
  R2_KEY_PREFIX,
  storageCategoryForRoute,
  storageSurfaceForRoute,
} from "./storage.js";

describe("r2 fileKey convention", () => {
  it("round-trips bucket and key", () => {
    const key = buildR2FileKey(
      "erpsys-prod",
      "erpsys/2026/Evidence/u1-abc.jpg",
    );
    expect(key).toBe("r2:erpsys-prod:erpsys/2026/Evidence/u1-abc.jpg");
    expect(isR2FileKey(key)).toBe(true);
    expect(parseR2FileKey(key)).toEqual({
      bucket: "erpsys-prod",
      key: "erpsys/2026/Evidence/u1-abc.jpg",
    });
  });

  it("keeps colons inside the object key intact", () => {
    const parsed = parseR2FileKey("r2:b:seg:ment/key");
    expect(parsed).toEqual({ bucket: "b", key: "seg:ment/key" });
  });

  it("rejects non-R2 and malformed keys", () => {
    expect(R2_KEY_PREFIX).toBe("r2:");
    expect(parseR2FileKey("ut-file-key")).toBeNull();
    expect(parseR2FileKey("external:SOCIAL:https://x")).toBeNull();
    expect(parseR2FileKey("drive:o:f1")).toBeNull();
    expect(parseR2FileKey(null)).toBeNull();
    expect(parseR2FileKey(undefined)).toBeNull();
    expect(parseR2FileKey("r2:")).toBeNull();
    expect(parseR2FileKey("r2:bucket-only")).toBeNull();
    expect(parseR2FileKey("r2::key-only")).toBeNull();
    expect(parseR2FileKey("r2:bucket:")).toBeNull();
    expect(isR2FileKey(null)).toBe(false);
    expect(isR2FileKey("drive:o:f1")).toBe(false);
  });
});

describe("storage route mapping", () => {
  it("maps routes to key categories", () => {
    expect(storageCategoryForRoute("evidenceImage")).toBe("Evidence");
    expect(storageCategoryForRoute("mugshotCapture")).toBe("Mugshot");
    expect(storageCategoryForRoute("stampImage")).toBe("Stamp");
  });

  it("guards the surface per route", () => {
    expect(storageSurfaceForRoute("evidenceImage")).toBe("student");
    expect(storageSurfaceForRoute("mugshotCapture")).toBe("officer");
    expect(storageSurfaceForRoute("stampImage")).toBe("officer");
  });
});
