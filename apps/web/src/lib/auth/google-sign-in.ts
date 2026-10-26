/**
 * What "Sign in with Google" should actually do, given whatever session
 * the browser already holds.
 *
 * The bug this replaces: `LoginCard.signInWithGoogle` treated "I have a
 * session" as "this Google identity needs linking to my account". Those
 * are not the same claim. A student who signs in with Google, abandons
 * the fill-up prompt, and presses "back" lands on the login page still
 * holding a valid session cookie. Clicking Google again opened a
 * "Link Google Account?" dialog - offering to link an account to itself.
 * Confirming it called `linkSocial`, which better-auth refuses for an
 * identity that is already linked, so the student hit a dead end with no
 * way back into the app.
 *
 * The discriminator is the linked providers, not the session. A session
 * that already holds a Google account IS the Google identity, so there
 * is nothing to link - the user is authenticated and should be sent to
 * their destination. Only a session with no Google account (a password
 * or credential sign-in) has something to attach, and that is the one
 * case the dialog is for. `/settings/accounts` already gates on the
 * same condition, which is why linking works there and failed here.
 */
export type GoogleSignInIntent = "sign-in" | "link" | "continue";

export function googleSignInIntent(input: {
  signedIn: boolean;
  /**
   * Whether the current session already has a Google account. `null`
   * when the linked providers could not be read - see the note on the
   * unknown case below.
   */
  hasGoogle: boolean | null;
}): GoogleSignInIntent {
  if (!input.signedIn) return "sign-in";
  // `hasGoogle: null` means `listAccounts()` failed or has not resolved.
  // Treating that as "link" would reproduce the dead end for an unknown
  // reason; treating it as "continue" only navigates a user who is
  // already authenticated, and a genuine linking need is one click away
  // at /settings/accounts.
  if (input.hasGoogle !== false) return "continue";
  return "link";
}
