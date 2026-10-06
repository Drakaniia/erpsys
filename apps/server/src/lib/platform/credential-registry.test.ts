import { describe, expect, it } from "vitest";
import {
  CREDENTIAL_ENV_KEYS,
  CREDENTIAL_FIELDS,
  MASK,
  maskSecret,
} from "./credential-registry.js";
import { INTEGRATION_KEYS } from "./integration-settings.js";

describe("CREDENTIAL_FIELDS", () => {
  it("covers every integration with at least one field", () => {
    for (const key of INTEGRATION_KEYS) {
      expect(CREDENTIAL_FIELDS[key].length).toBeGreaterThan(0);
    }
  });

  it("declares every pair symmetrically", () => {
    for (const fields of Object.values(CREDENTIAL_FIELDS)) {
      const byKey = new Map(fields.map((field) => [field.envKey, field]));
      for (const field of fields) {
        if (!field.pair) continue;
        const other = byKey.get(field.pair);
        expect(other, `${field.envKey} pairs with a known key`).toBeTruthy();
        expect(other?.pair).toBe(field.envKey);
      }
    }
  });

  it("flattens to exactly the registry key list, without duplicates", () => {
    const flattened = Object.values(CREDENTIAL_FIELDS)
      .flat()
      .map((field) => field.envKey);
    expect([...CREDENTIAL_ENV_KEYS]).toEqual(flattened);
    expect(new Set(flattened).size).toBe(flattened.length);
  });
});

describe("maskSecret", () => {
  it("returns null for a missing value", () => {
    expect(maskSecret(null)).toBeNull();
    expect(maskSecret(undefined)).toBeNull();
    expect(maskSecret("")).toBeNull();
  });

  it("shows only dots below six characters", () => {
    expect(maskSecret("abcde")).toBe(MASK);
    expect(maskSecret("abc")).toBe(MASK);
  });

  it("keeps five characters and a fixed twelve dots above it", () => {
    expect(maskSecret("abcdef")).toBe(`abcde${MASK}`);
    expect(maskSecret("abcdefg")).toBe(`abcde${MASK}`);
    expect(maskSecret("a".repeat(80))).toBe(`aaaaa${MASK}`);
    expect(MASK).toHaveLength(12);
  });

  it("treats unicode by code units without throwing", () => {
    expect(maskSecret("😀😀")).toBe(MASK);
  });
});
