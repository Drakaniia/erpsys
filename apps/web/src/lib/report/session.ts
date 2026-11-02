/**
 * The generating user's name, as the PDF header prints it.
 *
 * This string appears in the header of EVERY page of EVERY report, and all three
 * consoles hand their Reports panel the same value. It was copy-pasted into the
 * three role wrappers, where three copies is three chances to drift -- and a
 * drift here is a wrong byline on a printed record, not a cosmetic glitch. So the
 * rule lives here, once, and the wrappers pass their session data in.
 *
 * It is a plain function rather than a store factory on purpose: the wrappers
 * already hold the reactive `authClient.useSession()` store and pass its current
 * value, so this module needs no knowledge of better-auth.
 */
export type ReportSessionUser = {
  name?: string | null;
  email?: string | null;
};

/**
 * `name` if the account has one, else the local part of the email, else
 * `"User"`. Never an empty string: the header always names someone.
 */
export function sessionUserName(
  data: { user?: unknown } | null | undefined,
): string {
  const user = data?.user as ReportSessionUser | undefined;
  return user?.name || user?.email?.split("@")[0] || "User";
}
