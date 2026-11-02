import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { authClient } from "$lib/auth-client";
import { homeRouteForRole } from "$lib/auth/redirect";
import { useIntegrations } from "$lib/integrations/use-integrations";
import AccountLinkDialog from "../../components/auth/AccountLinkDialog";
import GoogleIcon from "../../components/auth/GoogleIcon";

/** `routes/auth/settings/accounts/+page.svelte` — linked sign-in methods. */
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

  async function loadAccounts() {
    const res = await authClient.listAccounts();
    if (res.data) setAccounts(res.data);
  }

  const signedIn = !!sessionQuery.data?.user;
  useEffect(() => {
    if (!signedIn) return;
    void loadAccounts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signedIn]);

  const hasGoogle = accounts.some((p) => p.providerId === "google");
  const userEmail =
    (sessionQuery.data?.user as { email?: string } | undefined)?.email ?? "";

  async function confirmLink() {
    setLinkError("");
    const origin = window.location.origin;
    const dest = params.get("dest");
    const callbackURL = dest
      ? `${origin}/settings/accounts?dest=${encodeURIComponent(dest)}`
      : `${origin}/settings/accounts`;

    const result = await authClient.linkSocial({
      provider: "google",
      callbackURL,
    });

    if (result.error) {
      setLinkError(
        result.error.message || "Couldn't connect Google. Please try again.",
      );
      setLinkDialogOpen(false);
      return;
    }

    await loadAccounts();
    setLinkDialogOpen(false);

    if (dest) {
      navigate(dest);
      return;
    }
    const role = (sessionQuery.data?.user as { role?: string } | undefined)
      ?.role;
    navigate(homeRouteForRole(role));
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

            {flags.googleAuth ? (
              <div className="mt-6 divide-y divide-auth-border">
                <div className="flex items-center justify-between py-4">
                  <div className="flex items-center gap-3">
                    <GoogleIcon />
                    <div>
                      <p className="text-[15px] font-medium text-auth-ink">
                        Google
                      </p>
                      <p className="text-[13px] text-muted">{userEmail}</p>
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
                to="/login"
                className="text-[13px] font-medium text-auth-blue transition-opacity duration-140 hover:opacity-80"
              >
                Back to sign in
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
