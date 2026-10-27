import { describe, expect, it } from "vitest";
import { googleSignInIntent } from "./google-sign-in";

describe("googleSignInIntent", () => {
  describe("not signed in", () => {
    it("runs the ordinary Google sign-in", () => {
      expect(googleSignInIntent({ signedIn: false, hasGoogle: false })).toBe(
        "sign-in",
      );
    });
  });

  describe("signed in with Google already", () => {
    // The regression: a Google-only student who abandons the
    // fill-up prompt and hits "back" still holds a session. Clicking
    // Google again used to open "Link Google Account?" - offering to
    // link an account to itself. Confirming called `linkSocial`,
    // which better-auth refuses, so the student was stuck.
    // They are already authenticated; send them onward.
    it("continues to the destination instead of offering to link", () => {
      expect(googleSignInIntent({ signedIn: true, hasGoogle: true })).toBe(
        "continue",
      );
    });
  });

  describe("signed in without Google (password account)", () => {
    it("offers to link Google - the case the dialog was built for", () => {
      expect(googleSignInIntent({ signedIn: true, hasGoogle: false })).toBe(
        "link",
      );
    });
  });

  describe("linked providers could not be read", () => {
    // `listAccounts()` is a network call and can fail. Defaulting to
    // "link" here reproduces the dead end for an unknown reason;
    // defaulting to "continue" just navigates a user who is already
    // authenticated, and anyone who genuinely needs to link has
    // /settings/accounts one click away.
    it("continues rather than guessing that a link is needed", () => {
      expect(googleSignInIntent({ signedIn: true, hasGoogle: null })).toBe(
        "continue",
      );
    });
  });
});
