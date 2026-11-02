import { useMutation, useQuery } from "@tanstack/react-query";
import { api, queryClient } from "$lib/api";
import { broadcastIntegrationsChanged } from "$lib/perf/persist";
// Single source is $lib/domain/types (type-only copy; importing it
// never pulls server runtime or the Mongo driver into the web bundle).
import type { IntegrationKey } from "$lib/domain/types";

export type { IntegrationKey };

export type IntegrationFlags = {
  turnstile: boolean;
  r2: boolean;
  googleAuth: boolean;
  cloudflareChat: boolean;
  email: boolean;
  googleForms: boolean;
  googleCalendar: boolean;
};

export type CredentialFieldView = {
  envKey: string;
  label: string;
  hint: string;
  helpUrl: string | null;
  class: "secret" | "plain";
  required: boolean;
  value: string | null;
  masked: string | null;
  source: "env" | "stored" | "missing";
  unreadable: boolean;
  updatedAt: string | null;
  updatedByName: string | null;
};

export type AdminIntegrationRow = {
  key: IntegrationKey;
  label: string;
  description: string;
  enabled: boolean;
  configured: boolean;
  consequence: string;
  updatedByName: string | null;
  updatedAt: string | null;
  credentials: CredentialFieldView[];
  version: number;
  pendingRestart: boolean;
  overridesLoaded: boolean;
};

export type CredentialFailure = { key: string; reason: string };

export type SetIntegrationInput = { key: IntegrationKey; enabled: boolean };

export type SaveCredentialsInput = {
  key: IntegrationKey;
  version: number;
  values: Record<string, string | null>;
};

/**
 * Everything reads as on until the query lands: a consumer must not hide a
 * surface mid-load, and `pending` is how it knows the flags are not yet
 * authoritative. Matches the server's computed defaults.
 */
const ALL_ON: IntegrationFlags = {
  turnstile: true,
  r2: true,
  googleAuth: true,
  cloudflareChat: true,
  email: true,
  googleForms: true,
  googleCalendar: true,
};

/**
 * Short on purpose: this payload decides whether a sign-in method is offered
 * at all, so a switch an admin flips has to reach the next mount rather than
 * sit fresh for five minutes. Still long enough that a launch-seeded entry
 * (`["integrations", "public"]`) is not refetched the moment it is read.
 */
const STALE_TIME = 30_000;

/** Both GETs hit one path and answer with `{ data }`. */
type Envelope = { data?: unknown };

function payloadOf(data: unknown): unknown {
  return (data as Envelope | undefined)?.data;
}

type PublicPayload = {
  flags?: Partial<IntegrationFlags>;
  turnstileSiteKey?: string;
  overridesLoaded?: boolean;
};

/**
 * The same GET answers an admin with rows instead of booleans. Read them as
 * flags: an admin session is exactly the caller that just flipped a switch, and
 * treating its payload as "no flags" handed it every surface back on — the
 * login page kept offering Google after Google was turned off.
 */
function flagsFromRows(
  rows: AdminIntegrationRow[],
): Partial<IntegrationFlags> | null {
  const flags: Partial<IntegrationFlags> = {};
  for (const row of rows) {
    if (typeof row?.key === "string" && typeof row.enabled === "boolean") {
      flags[row.key] = row.enabled;
    }
  }
  return Object.keys(flags).length > 0 ? flags : null;
}

/**
 * Unauthenticated — the login page reads it before anyone has a session. An
 * admin session gets the row list from the same path, and its `enabled` values
 * are read as the flags so a switch the console sets applies to every page
 * that session visits.
 */
export function useIntegrations(): {
  flags: IntegrationFlags;
  turnstileSiteKey: string;
  overridesLoaded: boolean;
  pending: boolean;
} {
  const query = useQuery({
    ...api.admin.getIntegrations.queryOptions({ staleTime: STALE_TIME }),
    // Same path as the admin list, two payloads by session state — separate
    // keys stop one leaf from serving the other's data.
    queryKey: ["integrations", "public"],
  });
  const payload = payloadOf(query.data);
  const publicPayload =
    payload && !Array.isArray(payload) ? (payload as PublicPayload) : null;
  const overrides =
    publicPayload?.flags ??
    (Array.isArray(payload)
      ? flagsFromRows(payload as AdminIntegrationRow[])
      : null);
  return {
    flags: overrides ? { ...ALL_ON, ...overrides } : ALL_ON,
    turnstileSiteKey: publicPayload?.turnstileSiteKey ?? "",
    overridesLoaded: publicPayload?.overridesLoaded ?? true,
    pending: query.isPending,
  };
}

/** Session + admin surface. Row order is the server's blast-radius order. */
export function useAdminIntegrations(): {
  rows: AdminIntegrationRow[];
  pending: boolean;
  error: Error | null;
} {
  const query = useQuery({
    ...api.admin.getIntegrations.queryOptions({ staleTime: STALE_TIME }),
    queryKey: ["integrations", "admin"],
  });
  const payload = payloadOf(query.data);
  return {
    rows: Array.isArray(payload) ? (payload as AdminIntegrationRow[]) : [],
    pending: query.isPending,
    error: query.error,
  };
}

/**
 * One PATCH flips one row; both leaves refetch so no surface keeps a stale
 * flag, and the other tabs are told — otherwise a login page open beside the
 * console keeps offering a provider this tab just turned off.
 */
export function useSetIntegration() {
  return useMutation<void, Error, SetIntegrationInput>({
    mutationFn: (vars) =>
      api.admin.setIntegration.call(vars).then(() => undefined),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["integrations"] });
      broadcastIntegrationsChanged();
    },
  });
}

export function useSaveCredentials() {
  return useMutation<AdminIntegrationRow, Error, SaveCredentialsInput>({
    mutationFn: (vars) =>
      api.admin.saveIntegrationCredentials.call(vars) as Promise<AdminIntegrationRow>,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["integrations"] });
    },
  });
}

export function useResetCredentials() {
  return useMutation<AdminIntegrationRow, Error, IntegrationKey>({
    mutationFn: (key) =>
      api.admin.resetIntegrationCredentials.call({ key }) as Promise<AdminIntegrationRow>,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["integrations"] });
    },
  });
}

/**
 * Not a query: the export is a plaintext secret block, so nothing may keep it
 * in the query cache. The mutation's data is dropped once the caller is done.
 */
export function useExportCredentials() {
  return useMutation<
    { filename: string; content: string },
    Error,
    void
  >({
    mutationFn: () =>
      api.admin.exportIntegrationCredentials.call({}) as Promise<{
        filename: string;
        content: string;
      }>,
  });
}

export function failuresOf(error: unknown): CredentialFailure[] {
  const data = (error as { data?: { failures?: unknown } } | null)?.data;
  return Array.isArray(data?.failures)
    ? (data.failures as CredentialFailure[])
    : [];
}
