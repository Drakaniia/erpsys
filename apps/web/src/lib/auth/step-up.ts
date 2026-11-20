export const STEP_UP_REQUIRED = "STEP_UP_REQUIRED";

export type StepUpWaiter = {
  ok: () => void;
  cancel: () => void;
  authenticatorReset: boolean;
};

let open: ((waiter: StepUpWaiter) => void) | null = null;
let pending: Promise<void> | null = null;

/** The mounted `StepUpHost` registers itself so the API client can ask it for a confirmation. */
export function registerStepUpHost(
  opener: ((waiter: StepUpWaiter) => void) | null,
): void {
  open = opener;
}

/** Resolves once the administrator passes the required steps; rejects if they cancel. */
export function requestStepUp(authenticatorReset = false): Promise<void> {
  if (pending) return pending;
  const opener = open;
  if (!opener) {
    return Promise.reject(
      new Error("Confirmation is only available in the admin console."),
    );
  }
  pending = new Promise<void>((resolve, reject) => {
    opener({
      authenticatorReset,
      ok: () => {
        pending = null;
        resolve();
      },
      cancel: () => {
        pending = null;
        reject(new Error("Confirmation cancelled."));
      },
    });
  });
  return pending;
}
