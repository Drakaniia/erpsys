import { describe, expect, it } from "vitest";
import {
  parseStudentTab,
  visibleStudentTabs,
  STUDENT_TABS,
  type StudentTab,
} from "./tabs";

/**
 * `STUDENT_TABS` is the type vocabulary and stays whole; the Workers AI toggle
 * only changes which of those entries render. The parse side matters most — a
 * bookmarked `?tab=chat` must not land on an empty screen once chat is off.
 */
describe("student tabs", () => {
  it("keeps every tab in the vocabulary list", () => {
    expect(STUDENT_TABS.map((t) => t.id)).toEqual([
      "progress",
      "chat",
      "profile",
    ]);
  });

  it("drops chat from the rendered tabs when Workers AI is off", () => {
    expect(visibleStudentTabs(false).map((t) => t.id)).toEqual([
      "progress",
      "profile",
    ]);
    expect(visibleStudentTabs(true)).toBe(STUDENT_TABS);
  });

  it("parses chat only while it is on", () => {
    expect(parseStudentTab("chat", true)).toBe("chat");
    expect(parseStudentTab("chat", false)).toBe("progress");
  });

  it("keeps the other tabs and the defaults unchanged", () => {
    expect(parseStudentTab("profile", false)).toBe("profile");
    expect(parseStudentTab("progress", false)).toBe("progress");
    expect(parseStudentTab(null)).toBe("progress");
    expect(parseStudentTab("nope")).toBe("progress");
    // Default argument keeps the pre-toggle behaviour for existing callers.
    expect(parseStudentTab("chat")).toBe("chat" satisfies StudentTab);
  });
});
