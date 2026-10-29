import { useEffect, useId, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { toast as sonnerToast } from "sonner";

import AppleSwitch from "../ui/AppleSwitch";
import EmptyState from "../ui/EmptyState";
import IntegrationCredentialsEditor from "./IntegrationCredentialsEditor";
import IntegrationSetupGuide, { setupGuideFor } from "./IntegrationSetupGuide";
import CoreConfigSection from "./CoreConfigSection";
import { relativeTime } from "$lib/officer/format";
import { queryClient } from "$lib/api";
import {
  useAdminIntegrations,
  useExportCredentials,
  useSetIntegration,
  type AdminIntegrationRow,
  type IntegrationKey,
} from "$lib/integrations/use-integrations";

const SECONDARY_BUTTON =
  "inline-flex min-h-9 items-center rounded-lg border border-border px-3 text-sm text-ink transition-[transform,background-color] duration-100 ease-out hover:bg-surface active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-60";

const RESTART_COMMAND = "sudo systemctl restart erpsys";

const SELECTED_PARAM = "integration";

type StatusTone = "live" | "restart" | "missing" | "off";

const STATUS_LABEL: Record<StatusTone, string> = {
  live: "Live",
  restart: "Restart to apply",
  missing: "Needs credentials",
  off: "Off",
};

function statusOf(row: AdminIntegrationRow): StatusTone {
  if (!row.enabled) return "off";
  if (row.pendingRestart) return "restart";
  if (!row.configured) return "missing";
  return "live";
}

function defaultKey(rows: AdminIntegrationRow[]): IntegrationKey {
  return (rows.find((row) => statusOf(row) !== "live") ?? rows[0]).key;
}

/**
 * Master-detail: the list is the readiness overview (one status per
 * integration, in the server's blast-radius order), the detail pane is where
 * one integration is understood, set up and switched. The selection lives in
 * `?integration=` so a setup link can be shared and the back button works.
 */
export default function IntegrationsPanel({
  registerrefresh = () => {},
}: {
  ontoast?: (message: string, kind?: "success" | "error") => void;
  registerrefresh?: (fn: () => Promise<unknown> | void) => void;
}) {
  const query = useAdminIntegrations();
  const mutation = useSetIntegration();
  const [params] = useSearchParams();

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ["integrations"] });

  useEffect(() => {
    registerrefresh(refresh);
  });

  /**
   * Optimistic overlay: a flip renders instantly and a rollback writes the old
   * value back. No spinner; `busy` blocks the switch that is in flight.
   */
  const [optimistic, setOptimistic] = useState<
    Partial<Record<IntegrationKey, boolean>>
  >({});
  const rows = query.rows.map((row) => ({
    ...row,
    enabled: optimistic[row.key] ?? row.enabled,
  }));

  // Pinned once so flipping the default selection's switch does not move the
  // pane to another integration under the admin's cursor.
  const initialKey = useRef<IntegrationKey | null>(null);
  if (initialKey.current === null && rows.length > 0) {
    initialKey.current = defaultKey(rows);
  }

  const requested = params.get(SELECTED_PARAM);
  const chosen = rows.find((row) => row.key === requested) ?? null;
  const selected =
    chosen ?? rows.find((row) => row.key === initialKey.current) ?? null;

  function hrefFor(key: IntegrationKey | null): string {
    const next = new URLSearchParams(params);
    if (key) next.set(SELECTED_PARAM, key);
    else next.delete(SELECTED_PARAM);
    return `?${next.toString()}`;
  }

  function patch(
    row: AdminIntegrationRow,
    next: boolean,
    previous: boolean,
    announce: boolean,
  ) {
    setOptimistic((current) => ({ ...current, [row.key]: next }));
    mutation.mutate(
      { key: row.key, enabled: next },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ["integrations"] });
          if (!announce) return;
          sonnerToast.success(
            next
              ? `${row.label} enabled.`
              : `${row.label} disabled. ${row.consequence}`,
            {
              duration: 5_000,
              action: {
                label: "Undo",
                onClick: () => patch(row, previous, next, false),
              },
            },
          );
        },
        onError: () => {
          setOptimistic((current) => ({ ...current, [row.key]: previous }));
          queryClient.invalidateQueries({ queryKey: ["integrations"] });
          // No Undo: the value is already back where it was.
          sonnerToast.error(
            `Could not change ${row.label}. The switch was restored.`,
          );
        },
      },
    );
  }

  if (query.error) {
    return (
      <EmptyState
        variant="card"
        title="Could not load the integrations"
        hint="The server did not answer. Check the connection and retry. Nothing has been changed."
        action={
          <button type="button" onClick={refresh} className={SECONDARY_BUTTON}>
            Retry
          </button>
        }
      />
    );
  }

  if (query.pending) return <PanelSkeleton />;

  if (rows.length === 0 || !selected) {
    return (
      <EmptyState
        variant="card"
        title="No integrations reported"
        hint="The server answered with an empty list, so there is nothing to configure. Reload the page to ask again."
      />
    );
  }

  const liveCount = rows.filter((row) => statusOf(row) === "live").length;
  const pending = rows.filter((row) => row.pendingRestart);
  const bootFailed = rows.some((row) => row.overridesLoaded === false);
  // Below lg the list and the detail are separate screens; an explicit
  // selection in the URL is what opens the detail screen.
  const detailOpenOnMobile = chosen !== null;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-2xl text-sm text-pretty text-muted">
          Each switch takes effect straight away. Credentials are stored
          encrypted and apply after the next server restart.
        </p>
        <CredentialExport />
      </div>

      <RestartBanner count={pending.length} bootFailed={bootFailed} />

      <div className="grid gap-5 lg:grid-cols-[minmax(15rem,18rem)_minmax(0,1fr)] lg:items-start">
        <nav
          aria-label="Integrations"
          className={`lg:sticky lg:top-2 ${detailOpenOnMobile ? "hidden lg:block" : ""}`}
        >
          <p className="px-1 pb-2 text-xs text-muted">
            <span className="tabular-nums">{liveCount}</span> of{" "}
            <span className="tabular-nums">{rows.length}</span> live
          </p>
          <ul className="overflow-hidden rounded-xl border border-border bg-surface-raised">
            {rows.map((row) => {
              const isSelected = row.key === selected.key;
              return (
                <li
                  key={row.key}
                  className="border-b border-border last:border-b-0"
                >
                  <Link
                    to={hrefFor(row.key)}
                    replace
                    preventScrollReset
                    aria-current={isSelected ? "true" : undefined}
                    className={`flex min-h-14 items-center justify-between gap-3 px-4 py-2.5 transition-[background-color] duration-100 ease-out ${
                      !isSelected
                        ? "hover:bg-surface"
                        : detailOpenOnMobile
                          ? "bg-primary/[0.07]"
                          : "hover:bg-surface lg:bg-primary/[0.07]"
                    }`}
                  >
                    <span className="min-w-0">
                      <span
                        className={`block truncate text-sm text-ink ${isSelected ? "font-medium lg:font-semibold" : "font-medium"}`}
                      >
                        {row.label}
                      </span>
                      <StatusText tone={statusOf(row)} className="mt-0.5" />
                    </span>
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                      className="shrink-0 text-muted lg:hidden"
                    >
                      <path d="m9 6 6 6-6 6" />
                    </svg>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className={detailOpenOnMobile ? "" : "hidden lg:block"}>
          <IntegrationDetail
            key={selected.key}
            row={selected}
            backHref={hrefFor(null)}
            focusOnMount={detailOpenOnMobile}
            busy={
              mutation.isPending && mutation.variables?.key === selected.key
            }
            onflip={(next) => patch(selected, next, selected.enabled, true)}
          />
        </div>
      </div>

      <CoreConfigSection />
    </div>
  );
}

/** Shape as well as colour, so the four states survive greyscale. */
function StatusMark({ tone }: { tone: StatusTone }) {
  if (tone === "live") {
    return (
      <span
        aria-hidden="true"
        className="h-2 w-2 shrink-0 rounded-full bg-primary"
      />
    );
  }
  if (tone === "restart") {
    return (
      <span
        aria-hidden="true"
        className="h-2 w-2 shrink-0 rounded-full border-2 border-warning"
      />
    );
  }
  if (tone === "missing") {
    return (
      <span
        aria-hidden="true"
        className="h-2 w-2 shrink-0 rounded-full border border-muted"
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className="h-0.5 w-2 shrink-0 rounded-full bg-muted"
    />
  );
}

function StatusText({
  tone,
  className = "",
}: {
  tone: StatusTone;
  className?: string;
}) {
  return (
    <span
      className={`flex items-center gap-1.5 text-xs ${tone === "restart" ? "text-warning" : "text-muted"} ${className}`}
    >
      <StatusMark tone={tone} />
      {STATUS_LABEL[tone]}
    </span>
  );
}

function IntegrationDetail({
  row,
  backHref,
  focusOnMount,
  busy,
  onflip,
}: {
  row: AdminIntegrationRow;
  backHref: string;
  focusOnMount: boolean;
  busy: boolean;
  onflip: (next: boolean) => void;
}) {
  const headingId = `integration-heading-${useId()}`;
  const heading = useRef<HTMLHeadingElement | null>(null);
  const guide = setupGuideFor(row.key);

  // On the single-column layout the detail replaces the list, so focus moves
  // to its heading; on desktop the list keeps focus.
  useEffect(() => {
    if (!focusOnMount) return;
    if (window.matchMedia?.("(min-width: 64rem)").matches) return;
    heading.current?.focus();
  }, [focusOnMount]);

  return (
    <article
      aria-labelledby={headingId}
      className="overflow-hidden rounded-xl border border-border bg-surface-raised"
    >
      <header className="flex flex-col gap-4 border-b border-border px-5 py-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <Link
            to={backHref}
            replace
            preventScrollReset
            className="-ml-2 mb-2 inline-flex min-h-11 items-center gap-1 rounded-lg px-2 text-sm text-muted transition-[background-color] duration-100 ease-out hover:bg-surface lg:hidden"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="m15 18-6-6 6-6" />
            </svg>
            All integrations
          </Link>
          <h2
            id={headingId}
            ref={heading}
            tabIndex={-1}
            className="text-xl font-semibold tracking-[-0.015em] text-balance text-ink"
          >
            {row.label}
          </h2>
          <p className="mt-1 text-sm text-pretty text-muted">
            {row.description}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
            <StatusText tone={statusOf(row)} />
            <span aria-hidden="true">·</span>
            <span>
              {row.updatedAt
                ? `Last changed by ${row.updatedByName ?? "an admin"} · ${relativeTime(row.updatedAt)}`
                : "Never changed"}
            </span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2.5 sm:pt-1">
          <span className="text-sm font-medium text-ink" aria-hidden="true">
            {row.enabled ? "On" : "Off"}
          </span>
          <AppleSwitch
            checked={row.enabled}
            ariaLabel={`${row.label}, currently ${row.enabled ? "enabled" : "disabled"}`}
            busy={busy}
            onchange={onflip}
          />
        </div>
      </header>

      {row.key === "turnstile" && !row.enabled && (
        <p
          role="status"
          className="flex items-center gap-2 border-b border-border bg-warning/[0.06] px-5 py-3 text-sm text-warning"
        >
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            className="shrink-0"
          >
            <path d="M12 9v4" />
            <path d="M12 17h.01" />
            <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          </svg>
          Bot protection is off. Sign-in and registration are unchallenged.
        </p>
      )}

      <div className="flex flex-col gap-7 px-5 py-6">
        <section className="grid gap-4 sm:grid-cols-2">
          <div>
            <h3 className="text-sm font-medium text-ink">What it enables</h3>
            <p className="mt-1 text-sm leading-relaxed text-pretty text-muted">
              {guide.enables}
            </p>
          </div>
          <div>
            <h3 className="text-sm font-medium text-ink">When it is off</h3>
            <p className="mt-1 text-sm leading-relaxed text-pretty text-muted">
              {row.consequence}
            </p>
          </div>
        </section>

        <IntegrationSetupGuide
          integration={row.key}
          defaultOpen={!row.configured}
        />

        <section aria-labelledby={`${headingId}-credentials`}>
          <h3
            id={`${headingId}-credentials`}
            className="text-sm font-medium text-ink"
          >
            Credentials
          </h3>
          {row.key === "googleForms" ? (
            <p className="mt-1 text-sm leading-relaxed text-pretty text-muted">
              Uses the Client ID and Client secret saved under Google sign-in.
              Only the form owner&apos;s refresh token is entered here, and all
              three are required. Save and restart the shared client before
              saving this token.
            </p>
          ) : null}
          <IntegrationCredentialsEditor row={row} />
        </section>
      </div>
    </article>
  );
}

function PanelSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading the integration list"
      className="grid gap-5 lg:grid-cols-[minmax(15rem,18rem)_minmax(0,1fr)]"
    >
      <div
        aria-hidden="true"
        className="overflow-hidden rounded-xl border border-border bg-surface-raised"
      >
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className="flex flex-col gap-2 border-b border-border px-4 py-3.5 last:border-b-0"
            style={{ "--skeleton-i": i } as React.CSSProperties}
          >
            <div className="skeleton h-3 w-28 rounded" />
            <div className="skeleton h-2.5 w-16 rounded" />
          </div>
        ))}
      </div>
      <div
        aria-hidden="true"
        className="hidden flex-col gap-3 rounded-xl border border-border bg-surface-raised px-5 py-6 lg:flex"
      >
        <div className="skeleton h-5 w-40 rounded" />
        <div className="skeleton h-3 w-72 rounded" />
        <div className="skeleton mt-4 h-24 w-full rounded" />
      </div>
    </div>
  );
}

function RestartBanner({
  count,
  bootFailed,
}: {
  count: number;
  bootFailed: boolean;
}) {
  const [copied, setCopied] = useState(false);
  if (count === 0 && !bootFailed) return null;

  async function copy() {
    try {
      await navigator.clipboard.writeText(RESTART_COMMAND);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div
      role="status"
      className="flex flex-col gap-3 rounded-xl border border-warning/30 bg-warning/[0.05] px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
    >
      <div>
        <p className="text-sm font-medium text-ink">
          {bootFailed
            ? "Stored credentials were not applied at boot."
            : `${count} credential change${count === 1 ? "" : "s"} ${count === 1 ? "is" : "are"} waiting`}
        </p>
        <p className="mt-0.5 text-xs text-muted">
          {bootFailed
            ? "Restart after the database is reachable."
            : "Restart the service to apply them."}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <code
          translate="no"
          className="rounded bg-chrome px-2 py-1 font-mono text-xs text-ink"
        >
          {RESTART_COMMAND}
        </code>
        <button
          type="button"
          onClick={() => void copy()}
          className={SECONDARY_BUTTON}
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </div>
  );
}

function CredentialExport() {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const mutation = useExportCredentials();
  const content = mutation.data?.content ?? "";

  function download() {
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = mutation.data?.filename ?? "erpsys-integrations.env";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="flex w-full flex-col items-end gap-2 sm:w-auto">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className={SECONDARY_BUTTON}
      >
        Export .env
      </button>

      {open ? (
        <div className="w-full max-w-xl rounded-xl border border-border bg-surface-raised px-4 py-3">
          <p className="text-xs text-warning">
            This block contains live credentials. Anyone who can read it can
            sign in to Google, upload to R2 and send mail as this deployment.
          </p>
          <p className="mt-1 text-xs text-muted">
            Integration keys only. The core configuration stays in the
            deployment env file.
          </p>

          {content ? (
            <>
              <pre className="mt-3 max-h-72 select-all overflow-auto rounded-lg bg-chrome p-3 font-mono text-xs text-ink">
                {content}
              </pre>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => void copy()}
                  className={SECONDARY_BUTTON}
                >
                  {copied ? "Copied" : "Copy"}
                </button>
                <button
                  type="button"
                  onClick={download}
                  className={SECONDARY_BUTTON}
                >
                  Download
                </button>
              </div>
            </>
          ) : (
            <button
              type="button"
              onClick={() => mutation.mutate()}
              disabled={mutation.isPending}
              className={`${SECONDARY_BUTTON} mt-3`}
            >
              {mutation.isPending ? "Reading…" : "Show and copy"}
            </button>
          )}

          {mutation.error ? (
            <p role="alert" className="mt-2 text-xs text-warning">
              {mutation.error.message}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
