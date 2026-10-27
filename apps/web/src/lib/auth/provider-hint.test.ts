import { describe, expect, it } from "vitest";
import { signInFailureCopy } from "./provider-hint";

const ENUMERATION_WORDING =
  /no account|not found|does not exist|already registered|sign ?up/i;

describe("signInFailureCopy", () => {
  it("gives a message and a hint", () => {
    const copy = signInFailureCopy();
    expect(copy.message.length).toBeGreaterThan(0);
    expect(copy.hint.length).toBeGreaterThan(0);
  });

  it("does not echo Better Auth's generic credential error", () => {
    // The server returns one 401 for a wrong password and for an account
    // that only ever signed in with Google. Surfacing its text tells the
    // user nothing and reads like an accusation; we write our own.
    expect(signInFailureCopy().message).not.toMatch(
      /invalid email or password/i,
    );
  });

  it("points a failed password attempt at Google", () => {
    expect(signInFailureCopy().hint).toMatch(/google/i);
  });

  it("stays neutral about whether the account exists", () => {
    // The whole point of the client-side approach: no enumeration oracle.
    const { message, hint } = signInFailureCopy();
    for (const text of [message, hint]) {
      expect(text).not.toMatch(/@/);
      expect(text).not.toMatch(ENUMERATION_WORDING);
    }
  });

  describe("with google disabled", () => {
    it("points a google-only account at the forgot-password route", () => {
      // Turning Google off is the one dead end this feature creates: the
      // account may have no password at all, so the escalation has to name a
      // route that can mint one.
      expect(signInFailureCopy({ googleEnabled: false }).hint).toContain(
        "/login/forgot-password",
      );
    });

    it("keeps the generic message so the copy stays an oracle-free 401", () => {
      expect(signInFailureCopy({ googleEnabled: false })).toMatchObject({
        message: signInFailureCopy().message,
      });
    });

    it("stays neutral about whether the account exists", () => {
      const { message, hint } = signInFailureCopy({ googleEnabled: false });
      for (const text of [message, hint]) {
        expect(text).not.toMatch(/@/);
        expect(text).not.toMatch(ENUMERATION_WORDING);
      }
    });

    it("defaults to the google-pointing hint when the flag is omitted", () => {
      expect(signInFailureCopy()).toEqual(
        signInFailureCopy({ googleEnabled: true }),
      );
    });
  });
});
