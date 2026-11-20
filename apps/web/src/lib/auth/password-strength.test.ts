import { describe, expect, it } from "vitest";
import {
  assessPasswordStrength,
  passwordSchemaError,
} from "./password-strength";

describe("assessPasswordStrength", () => {
  it("rejects passwords the shared schema rejects as not acceptable", () => {
    for (const value of [
      "",
      "short1A",
      "alllowercasebutverylong",
      "ALLUPPERCASEBUTLONG",
    ]) {
      const strength = assessPasswordStrength(value);
      expect(strength.acceptable).toBe(false);
      expect(strength.score).toBe(0);
      expect(strength.label).toBe("Too weak");
      expect(strength.unmet.length).toBeGreaterThan(0);
    }
  });

  it("lists which schema rules are still unmet", () => {
    const strength = assessPasswordStrength("short");
    expect(strength.unmet).toEqual([
      "At least 12 characters",
      "An uppercase letter (A–Z)",
      "A lowercase letter (a–z)",
    ]);
    expect(assessPasswordStrength("alllowercasepass").unmet).toEqual([
      "An uppercase letter (A–Z)",
    ]);
  });

  it("scores the schema floor as acceptable Weak", () => {
    // 12 chars, upper + lower, nothing else.
    const strength = assessPasswordStrength("abcdefghijkA");
    expect(strength.acceptable).toBe(true);
    expect(strength.score).toBe(1);
    expect(strength.label).toBe("Weak");
    expect(strength.unmet).toEqual([]);
  });

  it("rewards length and character variety up to Strong", () => {
    const good = assessPasswordStrength("Abcdefghijklmn");
    expect(good.label).toBe("Good");

    const strong = assessPasswordStrength("Abcdefghijklmn34!");
    expect(strong.acceptable).toBe(true);
    expect(strong.score).toBe(3);
    expect(strong.label).toBe("Strong");
  });

  it("caps known weak passwords at Weak while staying acceptable", () => {
    const strength = assessPasswordStrength("Qwertyuiopq12");
    expect(strength.acceptable).toBe(true);
    expect(strength.score).toBe(1);
    expect(strength.label).toBe("Weak");
  });

  it("demotes repeated characters and alphabet runs", () => {
    const varied = assessPasswordStrength("Abcdefghijkl");
    expect(varied.score).toBeGreaterThan(1);

    const repeated = assessPasswordStrength("Abbbbbbbbbbbb");
    expect(repeated.acceptable).toBe(true);
    expect(repeated.score).toBe(1);
  });
});

describe("passwordSchemaError", () => {
  it("returns null for acceptable passwords", () => {
    expect(passwordSchemaError("Abcdefghijkl")).toBeNull();
  });

  it("returns the schema's message for rejected passwords", () => {
    expect(passwordSchemaError("short")).toBeTypeOf("string");
    expect(passwordSchemaError("short")?.length).toBeGreaterThan(0);
  });
});
