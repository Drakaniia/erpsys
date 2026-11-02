import { useState } from "react";
import { queryClient } from "$lib/api";
import {
  failuresOf,
  useResetCredentials,
  useSaveCredentials,
  type AdminIntegrationRow,
  type CredentialFieldView,
} from "$lib/integrations/use-integrations";

function sourceLabel(source: CredentialFieldView["source"]): string {
  if (source === "stored") return "Stored";
  if (source === "env") return ".env";
  return "Missing";
}

const INPUT =
  "w-full rounded-lg border border-border bg-surface-raised px-3 py-1.5 font-mono text-sm text-ink placeholder:text-muted transition-[border-color] duration-100 ease-out focus:border-primary";

const SECONDARY =
  "rounded-lg border border-border px-3 py-1.5 text-sm text-ink transition-[transform,background-color] duration-100 ease-out hover:bg-surface active:scale-[0.97]";

export default function IntegrationCredentialsEditor({
  row,
}: {
  row: AdminIntegrationRow;
}) {
  const save = useSaveCredentials();
  const reset = useResetCredentials();

  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState<{
    version: number;
    pendingRestart: boolean;
  } | null>(null);
  const [replacing, setReplacing] = useState<Record<string, boolean>>({});
  /** The body that failed, so Retry re-sends it unchanged. */
  const [sent, setSent] = useState<{
    key: AdminIntegrationRow["key"];
    version: number;
    values: Record<string, string>;
  } | null>(null);

  function valuesFromDrafts(): Record<string, string> {
    const values: Record<string, string> = {};
    for (const field of row.credentials) {
      const draft = drafts[field.envKey];
      if (field.class === "plain") {
        if (draft !== undefined && draft !== (field.value ?? "")) {
          values[field.envKey] = draft;
        }
        continue;
      }
      // A secret is only sent once the admin has typed a replacement.
      if (replacing[field.envKey] && draft !== undefined && draft !== "") {
        values[field.envKey] = draft;
      }
    }
    return values;
  }

  const values = valuesFromDrafts();
  const dirty = Object.keys(values).length > 0;

  function edit(field: CredentialFieldView, value: string) {
    setDrafts((current) => ({ ...current, [field.envKey]: value }));
  }

  function replace(field: CredentialFieldView) {
    setReplacing((current) => ({ ...current, [field.envKey]: true }));
    setDrafts((current) => ({ ...current, [field.envKey]: "" }));
  }

  function cancel() {
    setDrafts({});
    setReplacing({});
  }

  function submit() {
    if (!dirty) return;
    const payload = { key: row.key, version: row.version, values };
    setSent(payload);
    save.mutate(
      payload,
      {
        onSuccess: (result) => {
          setSaved({
            version: result.version,
            pendingRestart: result.pendingRestart,
          });
          cancel();
        },
      },
    );
  }

  function resetToEnv() {
    if (!window.confirm("Reset these credentials to the .env values?")) return;
    reset.mutate(row.key, {
      onSuccess: () => {
        setSent(null);
        cancel();
      },
    });
  }

  const confirmation = saved
    ? saved.pendingRestart
      ? "Saved · restart required"
      : "Saved"
    : null;

  const error = save.error ?? reset.error;
  const status = (error as { status?: number } | null)?.status;
  const failures = failuresOf(save.error);
  const unreadable = row.credentials.some((field) => field.unreadable);

  return (
    <div className="flex flex-col gap-4 pt-3">
      {unreadable && (
        <p role="status" className="border-l-2 border-warning pl-2.5 text-xs text-warning">
          Stored credentials cannot be read — the encryption key changed.
          Re-enter them, or reset to .env.
        </p>
      )}

      <div className="flex flex-col gap-4">
        {row.credentials.map((field) => {
          const secret = field.class === "secret";
          const isReplacing = secret && replacing[field.envKey] === true;
          return (
            <div key={field.envKey} className="flex flex-col gap-1">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-sm font-medium text-ink">
                  {field.label}
                  {field.required ? "" : " (optional)"}
                </span>
                <span className="text-[11px] text-muted">
                  {sourceLabel(field.source)}
                </span>
              </div>

              <div className="flex items-center gap-2">
                {!secret ? (
                  <input
                    type="text"
                    value={drafts[field.envKey] ?? field.value ?? ""}
                    onChange={(event) => edit(field, event.target.value)}
                    spellCheck={false}
                    aria-label={field.label}
                    className={INPUT}
                  />
                ) : isReplacing ? (
                  <input
                    type="password"
                    value={drafts[field.envKey] ?? ""}
                    onChange={(event) => edit(field, event.target.value)}
                    autoComplete="new-password"
                    spellCheck={false}
                    autoCapitalize="off"
                    aria-label={`New ${field.label}`}
                    className={INPUT}
                  />
                ) : (
                  <>
                    <span
                      aria-hidden="true"
                      className="font-mono text-sm tabular-nums text-ink"
                    >
                      {field.masked ?? "Not set"}
                    </span>
                    <span className="sr-only">
                      {field.masked === null
                        ? "Credential not set"
                        : "Credential set"}
                    </span>
                  </>
                )}

                {secret && !isReplacing && (
                  <button
                    type="button"
                    onClick={() => replace(field)}
                    className={SECONDARY}
                  >
                    Replace
                  </button>
                )}
              </div>

              <p className="text-[11px] leading-relaxed text-muted">
                {field.hint}
                {field.helpUrl ? (
                  <>
                    {" "}
                    <a
                      href={field.helpUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-primary underline underline-offset-2"
                    >
                      Open provider console
                    </a>
                  </>
                ) : null}
              </p>
            </div>
          );
        })}
      </div>

      {status === 422 ? (
        <div
          role="alert"
          className="rounded-lg border border-border bg-surface px-3 py-2 text-xs text-ink"
        >
          <p className="font-medium">{error?.message}</p>
          <ul className="mt-1 flex flex-col gap-0.5">
            {failures.map((failure) => (
              <li key={failure.key}>
                <span className="font-mono">{failure.key}</span> —{" "}
                {failure.reason}
              </li>
            ))}
          </ul>
        </div>
      ) : status === 409 ? (
        <div
          role="alert"
          className="rounded-lg border border-border bg-surface px-3 py-2 text-xs text-ink"
        >
          Another admin changed these credentials. Reload this row and re-enter
          your change.
        </div>
      ) : status === 429 ? (
        <p role="alert" className="text-xs text-warning">
          Too many attempts. Wait a minute, then retry.
        </p>
      ) : error ? (
        <p role="alert" className="text-xs text-warning">
          {error.message}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={!dirty || save.isPending}
          aria-busy={save.isPending ? "true" : undefined}
          className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-white transition-[transform,opacity] duration-100 ease-out active:scale-[0.97] disabled:opacity-50"
        >
          Save
        </button>
        <button
          type="button"
          onClick={cancel}
          disabled={save.isPending}
          className={SECONDARY}
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={resetToEnv}
          disabled={reset.isPending}
          className={SECONDARY}
        >
          Reset to .env
        </button>

        {status === 422 || (error && status !== 409 && status !== 429) ? (
          <button
            type="button"
            onClick={() => save.mutate(sent ?? { key: row.key, version: row.version, values })}
            className={SECONDARY}
          >
            Retry
          </button>
        ) : null}
        {status === 409 ? (
          <button
            type="button"
            onClick={() =>
              void queryClient.invalidateQueries({ queryKey: ["integrations"] })
            }
            className={SECONDARY}
          >
            Reload
          </button>
        ) : null}

        {confirmation && (
          <p
            role="status"
            className="text-xs text-muted transition-opacity duration-100 ease-out motion-reduce:transition-none"
          >
            {confirmation}
          </p>
        )}
      </div>
    </div>
  );
}
