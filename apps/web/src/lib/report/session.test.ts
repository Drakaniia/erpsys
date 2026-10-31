import { describe, expect, it } from "vitest";
import { sessionUserName } from "./session";

/**
 * This string is printed in the header of every page of every report, which is
 * why the rule is tested once here rather than three times in the role wrappers
 * (or, as it was, copy-pasted into all three of them).
 */
describe("sessionUserName", () => {
  it("prefers the account's own name", () => {
    expect(
      sessionUserName({
        user: { name: "Ana Reyes", email: "reyes@buksu.edu.ph" },
      }),
    ).toBe("Ana Reyes");
  });

  it("falls back to the email's local part when there is no name", () => {
    expect(sessionUserName({ user: { email: "reyes@buksu.edu.ph" } })).toBe(
      "reyes",
    );
  });

  it("falls back when the name is empty or absent", () => {
    expect(
      sessionUserName({ user: { name: "", email: "reyes@buksu.edu.ph" } }),
    ).toBe("reyes");
    expect(sessionUserName({ user: {} })).toBe("User");
  });

  it("names someone even before the session has resolved", () => {
    expect(sessionUserName(null)).toBe("User");
    expect(sessionUserName(undefined)).toBe("User");
    expect(sessionUserName({})).toBe("User");
  });

  it("never returns an empty string, which the header would print as a blank byline", () => {
    for (const data of [null, {}, { user: null }, { user: { email: "" } }]) {
      expect(sessionUserName(data as { user?: unknown })).toBeTruthy();
    }
  });
});
