import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * `config/auth.ts` reads `env` at import time, so a static import of the app
 * would construct the Google provider from `.env` before the stored overrides
 * exist. Importing the real index would open a port and a Mongo pool, so this
 * asserts the one ordering rule against the source instead.
 */
const source = readFileSync(
  fileURLToPath(new URL("../src/index.ts", import.meta.url)),
  "utf8",
);

describe("boot order", () => {
  it("imports the app dynamically, after overrides are applied", () => {
    expect(source).not.toContain('from "./app.js"');

    const applied = source.indexOf("applyEnvOverrides(");
    const snapshot = source.indexOf("snapshotAppliedFingerprints(");
    const imported = source.indexOf('await import("./app.js")');
    const built = source.indexOf("buildApp()");

    expect(applied).toBeGreaterThan(-1);
    expect(imported).toBeGreaterThan(applied);
    expect(imported).toBeGreaterThan(snapshot);
    expect(built).toBeGreaterThan(imported);
  });
});
