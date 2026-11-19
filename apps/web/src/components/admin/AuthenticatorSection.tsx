import { useState } from "react";
import ConfirmDialog from "../ConfirmDialog";
import {
  useAuthenticators,
  useResetAuthenticator,
  type AdminAuthenticator,
} from "$lib/integrations/use-integrations";

const SECONDARY_BUTTON =
  "inline-flex min-h-9 items-center rounded-lg border border-border px-3 text-sm text-ink transition-[transform,background-color] duration-100 ease-out hover:bg-surface active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-60";

/**
 * The authenticator app is the last step of the admin unlock. A reset forgets
 * the admin's device; they scan a new QR code at their next unlock.
 */
export default function AuthenticatorSection() {
  const query = useAuthenticators();
  const reset = useResetAuthenticator();
  const [resetTarget, setResetTarget] = useState<AdminAuthenticator | null>(
    null,
  );

  function closeReset() {
    if (reset.isPending) return;
    setResetTarget(null);
    reset.reset();
  }

  function confirmReset() {
    if (!resetTarget || reset.isPending) return;
    reset.mutate(resetTarget.userId, {
      onSuccess: () => setResetTarget(null),
    });
  }

  return (
    <section className="rounded-xl border border-border bg-surface-raised px-4 py-3">
      <p className="text-sm font-medium text-ink">Authenticator</p>
      <p className="mt-1 text-xs text-muted">
        Google or Microsoft Authenticator, asked for at the end of every admin
        unlock. Reset it when an admin loses their phone.
      </p>

      {query.error ? (
        <p role="alert" className="mt-3 text-xs text-warning">
          Could not load the admin list.
        </p>
      ) : query.isPending ? (
        <p className="mt-3 text-xs text-muted">Loading…</p>
      ) : (
        <ul className="mt-3 divide-y divide-border">
          {(query.data ?? []).map((admin) => (
            <li
              key={admin.userId}
              className="flex flex-wrap items-center justify-between gap-3 py-2"
            >
              <span className="min-w-0">
                <span className="block truncate text-sm text-ink">
                  {admin.name || admin.email}
                </span>
                <span className="block text-xs text-muted">
                  {admin.enrolled ? "Set up" : "Not set up"}
                </span>
              </span>
              {admin.enrolled ? (
                <button
                  type="button"
                  onClick={() => {
                    reset.reset();
                    setResetTarget(admin);
                  }}
                  disabled={reset.isPending}
                  className={SECONDARY_BUTTON}
                >
                  Reset
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {resetTarget ? (
        <ConfirmDialog
          open
          title="Reset authenticator?"
          body={
            <>
              Reset the authenticator for{" "}
              {resetTarget.name || resetTarget.email}? They will set up a new
              one at their next unlock.
              {reset.error ? (
                <span role="alert" className="mt-2 block text-warning">
                  {reset.error.message}
                </span>
              ) : null}
            </>
          }
          confirmLabel="Reset authenticator"
          destructive
          busy={reset.isPending}
          onconfirm={confirmReset}
          onclose={closeReset}
        />
      ) : null}
    </section>
  );
}
