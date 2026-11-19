import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { authClient } from "$lib/auth-client";
import { homeRouteForRole } from "$lib/auth/redirect";
import { isInternalPath } from "$lib/auth/completion-gate";
import { useIntegrations } from "$lib/integrations/use-integrations";
import AccountLinkDialog from "../../components/auth/AccountLinkDialog";
import GoogleIcon from "../../components/auth/GoogleIcon";
import EmailCodeForm from "../../components/auth/EmailCodeForm";

/** Linked sign-in methods for the signed-in account. */
export function ConnectedAccountsPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const sessionQuery = authClient.useSession();
  const { flags } = useIntegrations();

  const [accounts, setAccounts] = useState<
    { id: string; providerId: string }[]
  >([]);
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [linkError, setLinkError] = useState("");
  const [linking, setLinking] = useState(false);
  const [verified, setVerified] = useState(false);
  const role = (sessionQuery.data?.user as { role?: string } | undefined)
    ?.role;

  async function loadAccounts() {
    const res = await authClient.listAccounts().catch(() => null);
    if (res?.data) setAccounts(res.data);
  }

  const signedIn = !!sessionQuery.data?.user;
  useEffect(() => {
    if (!signedIn) return;
    void loadAccounts();
  }, [signedIn]);

  const hasGoogle = accounts.some((p) => p.providerId === "google");
  const userEmail =
    (sessionQuery.data?.user as { email?: string } | undefined)?.email ?? "";

  async function confirmLink() {
    if (linking) return;
    setLinking(true);
    setLinkError("");
    const origin = window.location.origin;
    const rawDest = params.get("dest");
    const dest = isInternalPath(rawDest) ? rawDest : null;
    const callbackURL = dest
      ? `${origin}/settings/accounts?dest=${encodeURIComponent(dest)}`
      : `${origin}/settings/accounts`;

    const result = await authClient
      .linkSocial({ provider: "google", callbackURL })
      .catch(() => ({ error: { message: "" } }));
    setLinking(false);

    if (result.error) {
      setLinkError(
        result.error.message || "Couldn't connect Google. Please try again.",
      );
      setLinkDialogOpen(false);
      return;
    }

    await loadAccounts();
    setLinkDialogOpen(false);
    navigate(dest ?? homeRouteForRole(role));
  }

  return (
    <>
      <div className="flex min-h-dvh items-center justify-center bg-white px-4 py-10">
        <div className="w-full max-w-[440px]">
          <div className="auth-card p-6 sm:p-8">
            <h1 className="text-[22px] leading-tight font-semibold tracking-[-0.022em] text-auth-ink">
              Connected accounts
            </h1>
            <p className="mt-1.5 text-sm leading-relaxed text-muted">
              Sign-in methods linked to your account.
            </p>

            {linkError ? (
              <p className="auth-alert mt-5" role="alert" aria-live="polite">
                {linkError}
              </p>
            ) : null}

            <section className="mt-6 space-y-3" aria-labelledby="email-verification-heading">
              <h2 id="email-verification-heading" className="text-[15px] font-medium text-auth-ink">Email verification</h2>
              {verified || sessionQuery.data?.user.emailVerified ? (
                <p role="status" className="text-sm text-muted">Email verified: {userEmail}</p>
              ) : (
                <>
                  <p className="text-sm text-muted">Your email is not verified. Verification is optional; you can keep using your account.</p>
                  <p className="text-sm text-muted">For staff or admin addresses, verification clears unverified credentials and existing sessions. Sign in with an email code afterward.</p>
                  {flags.email && userEmail ? <EmailCodeForm key={userEmail} email={userEmail} onSuccess={() => { setVerified(true); void authClient.getSession(); }} /> : <p className="text-sm text-muted">Email delivery is unavailable. Try again later.</p>}
                </>
              )}
            </section>

            {flags.googleAuth ? (
              <div className="mt-6 divide-y divide-auth-border">
                <div className="flex items-center justify-between gap-3 py-4">
                  <div className="flex min-w-0 items-center gap-3">
                    <GoogleIcon />
                    <div className="min-w-0">
                      <p className="text-[15px] font-medium text-auth-ink">
                        Google
                      </p>
                      <p className="truncate text-[13px] text-muted">
                        {userEmail}
                      </p>
                    </div>
                  </div>
                  {hasGoogle ? (
                    <span className="text-[13px] font-medium text-muted">
                      Connected
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setLinkDialogOpen(true)}
                      className="press rounded-lg border border-auth-border bg-white px-3 py-1.5 text-[13px] font-medium text-auth-ink transition-colors duration-100 hover:bg-surface"
                    >
                      Connect
                    </button>
                  )}
                </div>
              </div>
            ) : null}

            <div className="mt-6 text-center">
              <Link
                to={homeRouteForRole(role)}
                className="text-[13px] font-medium text-auth-blue underline-offset-2 hover:underline"
              >
                Back to console
              </Link>
            </div>
          </div>
        </div>
      </div>

      {linkDialogOpen ? (
        <AccountLinkDialog
          open={true}
          email={userEmail}
          onConfirm={() => void confirmLink()}
          onCancel={() => setLinkDialogOpen(false)}
        />
      ) : null}
    </>
  );
}
