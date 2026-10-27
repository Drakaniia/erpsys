export interface SignInFailureCopy {
  /** The alert line under the form. Never the server's own message. */
  message: string;
  /** The escalation shown only after a failed attempt. */
  hint: string;
}

/**
 * What the form says when a password sign-in is rejected.
 *
 * Better Auth answers a wrong password and a Google-only account with the
 * same 401 and the same body, because distinguishing them would tell any
 * caller which emails are registered. We keep that closed and pay for it
 * with copy instead: the alert stays generic, and the escalation points at
 * Google, which most likely owns the account. Nothing here reveals whether
 * the account exists.
 *
 * With Google off there is no provider left to point at, and a Google-only
 * account has no password — the reset flow is the only way back in, so the
 * hint says that instead.
 */
export function signInFailureCopy({
  googleEnabled = true,
}: { googleEnabled?: boolean } = {}): SignInFailureCopy {
  return {
    message: "Sign-in failed. Check your email and password and try again.",
    hint: googleEnabled
      ? "Used Google when you signed up? Continue with Google instead."
      : "Google sign-in is off, so a Google-only account has no password to try. Set one from /login/forgot-password, then sign in with email.",
  };
}
