export type LinkStep =
  | { kind: "confirm-password" }
  | { kind: "link-google"; dest: string | null }
  | { kind: "generic"; description: string };

const FALLBACK_DESCRIPTION =
  "Something went wrong during sign-in. Please try again.";

export function linkFlowStep(input: {
  error: string | null;
  errorDescription: string | null;
  signedIn: boolean;
  hasGoogleAccount: boolean;
  dest: string | null;
}): LinkStep {
  if (input.error !== "account_not_linked") {
    return {
      kind: "generic",
      description: input.errorDescription?.trim() || FALLBACK_DESCRIPTION,
    };
  }

  if (!input.signedIn) {
    return { kind: "confirm-password" };
  }

  if (input.hasGoogleAccount) {
    return { kind: "generic", description: FALLBACK_DESCRIPTION };
  }

  return { kind: "link-google", dest: input.dest };
}
