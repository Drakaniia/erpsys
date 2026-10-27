import { describe, expect, it } from "vitest";
import {
  COMPLETION_ALLOWED_PATHS,
  COMPLETION_DEST_KEY,
  COMPLETION_PATH,
  completionGate,
  isInternalPath,
} from "./completion-gate";

describe("completionGate", () => {
  const student = { role: "STUDENT", hasProfile: false };

  it("redirects a profile-less student away from an app path", () => {
    expect(completionGate({ path: "/student", ...student })).toBe(
      "redirect-to-completion",
    );
  });

  it("gates every app surface, not just the student one", () => {
    for (const p of [
      "/student",
      "/queue",
      "/officer",
      "/instructor",
      "/admin",
    ]) {
      expect(completionGate({ path: p, ...student })).toBe(
        "redirect-to-completion",
      );
    }
  });

  it("exempts the completion route itself — otherwise it loops forever", () => {
    expect(completionGate({ path: COMPLETION_PATH, ...student })).toBe("allow");
  });

  it("allows a student who already has a profile", () => {
    expect(
      completionGate({
        path: "/student",
        role: "STUDENT",
        hasProfile: true,
      }),
    ).toBe("allow");
  });

  it("allows while the profile lookup is still in flight", () => {
    expect(
      completionGate({
        path: "/student",
        role: "STUDENT",
        hasProfile: undefined,
      }),
    ).toBe("allow");
  });

  it("never gates a non-student role, profile or not", () => {
    for (const role of [
      "ENROLLMENT_ADVISER",
      "SBO_OFFICER",
      "ADMIN",
      undefined,
      "",
    ]) {
      expect(
        completionGate({ path: "/instructor", role, hasProfile: false }),
      ).toBe("allow");
    }
  });

  it("allows the landing path so the role home can resolve first", () => {
    expect(completionGate({ path: "/", ...student })).toBe("allow");
  });

  it("allows the interstitial and the OAuth-error page", () => {
    for (const p of ["/loading", "/auth/error"]) {
      expect(completionGate({ path: p, ...student })).toBe("allow");
    }
  });

  it("allows the account-linking page — gating it would be a trap", () => {
    expect(completionGate({ path: "/settings/accounts", ...student })).toBe(
      "allow",
    );
  });

  it("keeps every allow-listed path out of the redirect", () => {
    for (const p of COMPLETION_ALLOWED_PATHS) {
      expect(completionGate({ path: p, ...student })).toBe("allow");
    }
  });
});

describe("isInternalPath", () => {
  it("accepts a hash-path", () => {
    expect(isInternalPath("/student")).toBe(true);
  });

  it("rejects an absolute URL — the dest value reaches goto()", () => {
    expect(isInternalPath("https://evil.example/steal")).toBe(false);
    expect(isInternalPath("//evil.example/steal")).toBe(false);
    expect(isInternalPath("javascript:alert(1)")).toBe(false);
  });

  it("rejects junk and empty values", () => {
    expect(isInternalPath(null)).toBe(false);
    expect(isInternalPath(undefined)).toBe(false);
    expect(isInternalPath("")).toBe(false);
    expect(isInternalPath("student")).toBe(false);
  });
});

describe("COMPLETION_DEST_KEY", () => {
  it("is a stable, namespaced key", () => {
    expect(COMPLETION_DEST_KEY).toBe("erpsys:completion-dest");
  });
});
