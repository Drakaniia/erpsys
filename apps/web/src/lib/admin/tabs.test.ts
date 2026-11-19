import { describe, expect, it } from "vitest";
import { ADMIN_TABS, isAdminTab } from "./tabs";

describe("admin tabs", () => {
  it("does not expose a separate active-editor page", () => {
    expect(isAdminTab("active-editors")).toBe(false);
    expect(ADMIN_TABS.some((tab) => tab.label === "Active Editors")).toBe(
      false,
    );
    expect(isAdminTab("overview")).toBe(true);
    expect(isAdminTab("audit-log")).toBe(true);
  });
});
