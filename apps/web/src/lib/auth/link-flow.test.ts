import { describe, expect, it } from "vitest";
import { linkFlowStep } from "./link-flow";

const base = {
  error: "account_not_linked" as string | null,
  errorDescription: null as string | null,
  dest: null as string | null,
};

describe("linkFlowStep", () => {
  it("asks a signed-out password user to confirm their password", () => {
    expect(
      linkFlowStep({ ...base, signedIn: false, hasGoogleAccount: false }),
    ).toEqual({ kind: "confirm-password" });
  });

  it("offers the link once the user is signed in", () => {
    expect(
      linkFlowStep({ ...base, signedIn: true, hasGoogleAccount: false }),
    ).toEqual({ kind: "link-google", dest: null });
  });

  it("passes the original destination through to the link step", () => {
    expect(
      linkFlowStep({
        ...base,
        signedIn: true,
        hasGoogleAccount: false,
        dest: "/instructor",
      }),
    ).toEqual({ kind: "link-google", dest: "/instructor" });
  });

  it("falls through when Google is already linked — nothing left to do", () => {
    const step = linkFlowStep({
      ...base,
      signedIn: true,
      hasGoogleAccount: true,
    });
    expect(step.kind).not.toBe("link-google");
    expect(step.kind).not.toBe("confirm-password");
  });


  it("shows a generic step for any other error, with no link flow", () => {
    const step = linkFlowStep({
      ...base,
      error: "access_denied",
      signedIn: false,
      hasGoogleAccount: false,
    });
    expect(step.kind).toBe("generic");
  });

  it("surfaces Better Auth's error_description on the generic step", () => {
    const step = linkFlowStep({
      ...base,
      error: "state_mismatch",
      errorDescription: "The state parameter did not match.",
      signedIn: false,
      hasGoogleAccount: false,
    });
    expect(step).toEqual({
      kind: "generic",
      description: "The state parameter did not match.",
    });
  });

  it("falls back to friendly copy when error_description is absent", () => {
    const step = linkFlowStep({
      ...base,
      error: "state_mismatch",
      errorDescription: null,
      signedIn: false,
      hasGoogleAccount: false,
    });
    expect(step).toEqual({
      kind: "generic",
      description: "Something went wrong during sign-in. Please try again.",
    });
  });

  it("treats a missing error param as the generic path, not the link flow", () => {
    const step = linkFlowStep({
      ...base,
      error: null,
      signedIn: true,
      hasGoogleAccount: false,
    });
    expect(step.kind).toBe("generic");
  });
});
