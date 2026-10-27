import { useRef, useState } from "react";
import { useNavigate } from "react-router";
import { authClient } from "$lib/auth-client";
import { homeRouteForRole } from "$lib/auth/redirect";
import { googleSignInIntent } from "$lib/auth/google-sign-in";
import { isInternalPath } from "$lib/auth/completion-gate";

/**
 * The Google button on the login card: the already-signed-in/link decision,
 * the OAuth redirect, and the account-linking dialog it can raise.
 *
 * "I have a session" is NOT "this Google identity needs linking". A student who
 * abandons the fill-up prompt and presses back lands here still authenticated;
 * offering to link them to themselves produced a dialog whose confirm always
 * failed. Gate on the LINKED PROVIDERS instead - see google-sign-in.ts.
 *
 * OAuth returns to `dest` when it is an internal path, otherwise to `/`, where
 * the root gate sends the account to the console its role owns.
 */
export function useGoogleSignIn({
  dest,
  onError,
}: {
  dest: string | null;
  onError: (message: string) => void;
}) {
  const navigate = useNavigate();
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [linkDialogEmail, setLinkDialogEmail] = useState("");
  const pendingGoogleUser = useRef<{
    email: string;
    id: string;
    role?: string;
  } | null>(null);
  // Set the moment the Google button is pressed and left on through the
  // OAuth redirect (the page unloads). Reset only on paths that stay here.
  const [googleBusy, setGoogleBusy] = useState(false);

  async function signInWithGoogle() {
    if (googleBusy) return;
    setGoogleBusy(true);
    sessionStorage.setItem("lastAuthProvider", "google");
    const origin = window.location.origin;
    const googleCb = `${origin}${isInternalPath(dest) ? dest : "/"}`;

    try {
      const currentSession = await authClient.getSession();
      const currentUser = currentSession.data?.user as
        | { email: string; id: string; role?: string }
        | undefined;

      let hasGoogle: boolean | null = null;
      if (currentUser) {
        const accounts = await authClient
          .listAccounts()
          .then((res) => res.data)
          .catch(() => null);
        hasGoogle = accounts
          ? accounts.some((a) => a.providerId === "google")
          : null;
      }

      const intent = googleSignInIntent({
        signedIn: Boolean(currentUser),
        hasGoogle,
      });

      if (intent === "link" && currentUser) {
        setLinkDialogEmail(currentUser.email);
        pendingGoogleUser.current = currentUser;
        setLinkDialogOpen(true);
        setGoogleBusy(false);
        return;
      }

      if (intent === "continue" && currentUser) {
        // Already authenticated with this identity - no OAuth round trip
        // and nothing to link. Send them where they were headed.
        navigate(dest ?? homeRouteForRole(currentUser.role));
        return;
      }

      await authClient.signIn.social({
        provider: "google",
        callbackURL: googleCb,
        errorCallbackURL: `${origin}/auth/error`,
      });
    } catch {
      // Redirect-away paths never land here; anything caught stayed on
      // this page, so release the button instead of freezing it busy.
      setGoogleBusy(false);
    }
  }

  async function handleLinkConfirm() {
    if (!pendingGoogleUser.current) return;

    const origin = window.location.origin;
    const linkCb = `${origin}${isInternalPath(dest) ? dest : "/"}`;
    const result = await authClient.linkSocial({
      provider: "google",
      callbackURL: linkCb,
    });

    if (result.error) {
      onError(
        result.error.message || "Failed to link account. Please try again.",
      );
      setLinkDialogOpen(false);
      pendingGoogleUser.current = null;
      return;
    }

    setLinkDialogOpen(false);
    pendingGoogleUser.current = null;
    navigate(`/loading?message=Account+linked+successfully…`);
  }

  function handleLinkCancel() {
    setLinkDialogOpen(false);
    pendingGoogleUser.current = null;
  }

  return {
    googleBusy,
    signInWithGoogle,
    linkDialogOpen,
    linkDialogEmail,
    handleLinkConfirm,
    handleLinkCancel,
  };
}
