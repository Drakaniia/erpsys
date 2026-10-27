import { useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { useForm } from "@tanstack/react-form";
import { z } from "zod";
import { authClient } from "$lib/auth-client";
import { useGoogleSignIn } from "./use-google-sign-in";
import AuthField from "./AuthField";
import GoogleIcon from "./GoogleIcon";
import AccountLinkDialog from "./AccountLinkDialog";
import Turnstile, { type TurnstileHandle } from "./Turnstile";
import { useIntegrations } from "$lib/integrations/use-integrations";
import { signInFailureCopy } from "$lib/auth/provider-hint";

const validationSchema = z.object({
  email: z.email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

/**
 * The one sign-in form. There is no account-type picker: the session's role
 * decides where `/loading` sends the user once they are in.
 */
export default function LoginCard() {
  const navigate = useNavigate();
  const [params] = useSearchParams();

  const { flags, turnstileSiteKey } = useIntegrations();
  const showGoogle = flags.googleAuth;

  const [formError, setFormError] = useState("");

  const google = useGoogleSignIn({
    dest: params.get("dest"),
    onError: setFormError,
  });

  /**
   * Set only after a rejected password attempt, cleared the moment the user
   * edits a field or resubmits. The generic alert is the right thing to show
   * a wrong password; this block is what rescues the person whose account
   * only ever signed in with Google and is now staring at that alert with no
   * idea why.
   */
  const [showGoogleRecovery, setShowGoogleRecovery] = useState(false);
  const failureCopy = signInFailureCopy({ googleEnabled: showGoogle });
  const [turnstileToken, setTurnstileToken] = useState("");
  const turnstileRef = useRef<TurnstileHandle | null>(null);
  const turnstileEnabled =
    flags.turnstile && turnstileSiteKey.trim().length > 0;

  // Verification failures are a different problem from a rejected
  // credential, so the Google rescue must not linger under a challenge error.
  function handleTurnstileExpire() {
    setTurnstileToken("");
    setFormError("Verification expired — please complete the challenge again.");
    setShowGoogleRecovery(false);
  }

  function handleTurnstileError() {
    setTurnstileToken("");
    setFormError(
      "Verification failed. Click Retry and complete the challenge again.",
    );
    setShowGoogleRecovery(false);
  }

  function resetTurnstile() {
    try {
      turnstileRef.current?.reset();
    } catch {
      /* ignore */
    }
    setTurnstileToken("");
  }

  function clearErrors() {
    setFormError("");
    setShowGoogleRecovery(false);
  }

  const form = useForm({
    defaultValues: { email: "", password: "" },
    onSubmit: async ({ value, formApi }) => {
      clearErrors();
      const parsed = validationSchema.safeParse(value);
      if (!parsed.success) {
        for (const issue of parsed.error.issues) {
          const name = issue.path[0];
          if (name === "email" || name === "password") {
            formApi.setFieldMeta(name, (prev) => ({
              ...prev,
              errors: [issue.message],
            }));
          }
        }
        return;
      }
      if (turnstileEnabled && !turnstileToken) {
        setFormError("Please complete the verification challenge.");
        return;
      }
      sessionStorage.setItem("lastAuthProvider", "credential");
      const result = await authClient.signIn.email({
        email: value.email,
        password: value.password,
        "cf-turnstile-response": turnstileToken,
      } as unknown as Record<string, unknown> & {
        email: string;
        password: string;
      });
      resetTurnstile();
      if (result.error) {
        // Deliberately NOT result.error.message. The server's 401 body is the
        // same for a wrong password and for an account with no credential
        // record. Our copy stays neutral and points at Google instead.
        setFormError(failureCopy.message);
        setShowGoogleRecovery(showGoogle);
        return;
      }
      const dest = params.get("dest");
      navigate(
        dest
          ? `/loading?dest=${encodeURIComponent(dest)}&message=Signing+you+in…`
          : `/loading?message=Signing+you+in…`,
      );
    },
  });

  const googleButtonContent = google.googleBusy ? (
    <>
      <span
        className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent opacity-70 motion-reduce:animate-none"
        aria-hidden="true"
      />
      Connecting…
    </>
  ) : (
    <>
      <GoogleIcon />
      Continue with Google
    </>
  );

  return (
    <div className="w-full">
      <h1 className="text-[30px] leading-[1.1] font-bold tracking-[-0.03em] text-auth-ink">
        Sign in to ERPSYS
      </h1>
      <p className="mt-2 text-sm leading-relaxed text-muted">
        Students, instructors and SBO officers all sign in here. We'll open the
        console for your role.
      </p>

      <form
        className="auth-section space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          e.stopPropagation();
          void form.handleSubmit();
        }}
      >
        <form.Field name="email">
          {(field) => (
            <AuthField
              field={field}
              label="Email"
              type="email"
              autocomplete="email"
              placeholder="you@buksu.edu.ph"
              onedit={clearErrors}
            />
          )}
        </form.Field>

        <form.Field name="password">
          {(field) => (
            <AuthField
              field={field}
              label="Password"
              type="password"
              autocomplete="current-password"
              onedit={clearErrors}
              labelAction={
                <Link
                  to="/login/forgot-password"
                  className="text-[13px] font-medium text-auth-blue transition-opacity duration-140 hover:opacity-80"
                >
                  Forgot password?
                </Link>
              }
            />
          )}
        </form.Field>

        {turnstileEnabled ? (
          <Turnstile
            ref={turnstileRef}
            sitekey={turnstileSiteKey}
            action="login"
            onToken={(t) => {
              setTurnstileToken(t);
              if (t) setFormError("");
            }}
            onExpire={handleTurnstileExpire}
            onError={handleTurnstileError}
          />
        ) : null}

        {formError ? (
          <p className="auth-alert" role="alert" aria-live="polite">
            {formError}
          </p>
        ) : null}

        {showGoogleRecovery ? (
          <div
            className="rounded-lg border border-auth-border bg-blue-50 px-4 py-3"
            role="status"
            aria-live="polite"
          >
            <p className="text-[13px] leading-relaxed text-muted">
              {failureCopy.hint}
            </p>
            <button
              type="button"
              onClick={() => void google.signInWithGoogle()}
              className="auth-btn-secondary mt-3 w-full"
              disabled={google.googleBusy}
              aria-busy={google.googleBusy}
            >
              {googleButtonContent}
            </button>
          </div>
        ) : null}

        <form.Subscribe selector={(state) => state.isSubmitting}>
          {(isSubmitting) => (
            <button
              type="submit"
              className="auth-btn-primary"
              disabled={isSubmitting}
            >
              {isSubmitting ? "Signing in…" : "Sign in"}
            </button>
          )}
        </form.Subscribe>
      </form>

      {showGoogle && !showGoogleRecovery ? (
        <>
          <div className="auth-section flex items-center gap-3 text-[13px] text-muted">
            <span className="h-px flex-1 bg-auth-border" />
            or
            <span className="h-px flex-1 bg-auth-border" />
          </div>
          <button
            type="button"
            onClick={() => void google.signInWithGoogle()}
            className="auth-btn-secondary mt-4"
            disabled={google.googleBusy}
            aria-busy={google.googleBusy}
          >
            {googleButtonContent}
          </button>
        </>
      ) : null}

      <p className="auth-section text-center text-[13px] text-muted">
        New student?{" "}
        <Link
          to="/login/register"
          className="font-semibold text-auth-blue transition-opacity duration-140 hover:opacity-80"
        >
          Create an account
        </Link>
      </p>

      {google.linkDialogOpen ? (
        <AccountLinkDialog
          open={true}
          email={google.linkDialogEmail}
          onConfirm={() => void google.handleLinkConfirm()}
          onCancel={google.handleLinkCancel}
        />
      ) : null}
    </div>
  );
}
