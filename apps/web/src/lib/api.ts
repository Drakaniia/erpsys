import {
  QueryCache,
  QueryClient,
  skipToken,
  type UseMutationOptions,
  type UseQueryOptions,
} from "@tanstack/react-query";
import { ROUTES, type ClientRoute } from "./api-routes";
import { CACHE_MAX_AGE_MS } from "./perf/cache-policy";
import { requestStepUp, STEP_UP_REQUIRED } from "./auth/step-up";
import { notify } from "./notifications";

export const TS_ABORTED = "TS_ABORTED";

// The server's transaction timestamp for every record id the client has seen;
// edits send it back so a stale edit is aborted instead of overwriting.
const tsById = new Map<string, number>();

function rememberTs(data: unknown, ts: number): void {
  for (const row of Array.isArray(data) ? data : [data]) {
    if (!row || typeof row !== "object") continue;
    const id = (row as { _id?: unknown; id?: unknown })._id ?? (row as { id?: unknown }).id;
    if (id !== undefined && id !== null) tsById.set(String(id), ts);
  }
}

export type Procedure<I = unknown, O = unknown> = {
  input?: I;
  output?: O;
};
export type RestRouters = Record<
  string,
  Record<string, Procedure<unknown, unknown>>
>;
export type InputOf<_P> = any;
export type OutputOf<_P> = any;

export const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error) => {
      console.error(`Error: ${error.message}`);
    },
  }),
  defaultOptions: {
    queries: {
      // Entries must survive until the persisted-cache 24h cap, not the 5m
      // default — otherwise a quiet query is garbage-collected before it can
      // be written back.
      gcTime: CACHE_MAX_AGE_MS,
      retry: (failureCount, error) =>
        failureCount < 3 &&
        (!(error instanceof ApiClientError) || error.status !== 401),
    },
  },
});

export class ApiClientError extends Error {
  readonly status: number;
  /** The server's `data` payload — probe failures on a `422`, for example. */
  readonly data?: unknown;

  constructor(
    status: number,
    body: { error?: string; data?: unknown },
    fallback: string,
  ) {
    super(body.error ?? fallback);
    this.name = "ApiClientError";
    this.status = status;
    this.data = body.data;
  }
}

const ID_ALIASES = [
  "studentProfileId",
  "verificationId",
  "entryId",
  "enrollmentId",
  "uploadId",
  "requestId",
  "departmentId",
  "yearId",
  "academicYearId",
];

function buildPath(
  path: string,
  input: Record<string, unknown>,
): { path: string; rest: Record<string, unknown>; params: string[] } {
  const rest = { ...input };
  const params: string[] = [];
  const resolved = path.replace(/:([A-Za-z0-9_]+)/g, (_match, name: string) => {
    if (rest[name] === undefined && name === "id") {
      for (const alt of ID_ALIASES) {
        if (rest[alt] !== undefined && rest[alt] !== null) {
          rest[name] = rest[alt];
          delete rest[alt];
          break;
        }
      }
    }
    if (
      rest[name] === undefined &&
      name === "code" &&
      rest.stepCode !== undefined
    ) {
      rest[name] = rest.stepCode;
      delete rest.stepCode;
    }
    const value = rest[name];
    delete rest[name];
    params.push(String(value));
    return encodeURIComponent(String(value));
  });
  return { path: resolved, rest, params };
}

function toSearch(rest: Record<string, unknown>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(rest)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      for (const item of value) params.append(key, String(item));
    } else {
      params.set(key, String(value));
    }
  }
  const query = params.toString();
  return query ? `?${query}` : "";
}

async function request(route: ClientRoute, input: unknown): Promise<unknown> {
  try {
    return await send(route, input);
  } catch (error) {
    if (
      error instanceof ApiClientError &&
      error.status === 409 &&
      (error.data as { code?: string } | undefined)?.code === TS_ABORTED
    ) {
      void queryClient.invalidateQueries();
      notify.error(
        "This record changed since you opened it. It has been reloaded — please try again.",
      );
      throw error;
    }
    const locked =
      error instanceof ApiClientError &&
      error.status === 403 &&
      (error.data as { code?: string } | undefined)?.code === STEP_UP_REQUIRED;
    if (!locked) throw error;
    await requestStepUp();
    return send(route, input);
  }
}

async function send(route: ClientRoute, input: unknown): Promise<unknown> {
  const value = (input ?? {}) as Record<string, unknown>;
  const hasId = value.id !== undefined && value.id !== null;
  const def = route.update && hasId ? route.update : route;
  const { path, rest, params } = buildPath(def.path, value);
  if (def.method !== "GET" && def.method !== "POST" && rest.ts === undefined) {
    const ts = params.map((p) => tsById.get(p)).find((t) => t !== undefined);
    if (ts !== undefined) rest.ts = ts;
  }
  const hasBody =
    def.method !== "GET" &&
    (def.method !== "DELETE" || Object.keys(rest).length > 0);
  const base = (
    (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? ""
  ).replace(/\/+$/, "");
  const url = base + (hasBody ? path : `${path}${toSearch(rest)}`);

  const response = await fetch(url, {
    method: def.method,
    credentials: "include",
    headers: hasBody ? { "content-type": "application/json" } : undefined,
    body: hasBody ? JSON.stringify(rest) : undefined,
  });

  if (!response.ok) {
    let body: { error?: string; data?: unknown } = {};
    try {
      body = await response.json();
    } catch {
      // A non-JSON failure (proxy, gateway) still becomes an ApiClientError.
    }
    throw new ApiClientError(
      response.status,
      body,
      `Request failed (${response.status})`,
    );
  }

  const text = await response.text();
  const json: unknown = text ? JSON.parse(text) : undefined;
  if (json && typeof json === "object" && "data" in json) {
    const { ts } = json as { ts?: unknown };
    if (typeof ts === "number") rememberTs((json as { data: unknown }).data, ts);
    if (route.list) return json;
    return (json as { data: unknown }).data;
  }
  return json;
}

type QueryOptions<I, O> = UseQueryOptions<O, Error, O, readonly unknown[]>;
type QueryExtras<I, O> = Omit<QueryOptions<I, O>, "queryKey" | "queryFn"> & {
  input?: I | typeof skipToken;
};
type MutationOptions<I, O> = Omit<
  UseMutationOptions<O, Error, I, unknown>,
  "mutationKey"
>;

type Leaf<I, O> = {
  queryKey: (input?: I) => readonly unknown[];
  queryOptions: (opts?: QueryExtras<I, O>) => QueryOptions<I, O>;
  mutationOptions: (opts?: MutationOptions<I, O>) => MutationOptions<I, O>;
  call: (input?: I) => Promise<O>;
};

type LeafFor<P> = Leaf<InputOf<P>, OutputOf<P>>;

type ApiShape = {
  [R in keyof RestRouters]: {
    [K in keyof RestRouters[R]]: LeafFor<RestRouters[R][K]>;
  };
};

function makeLeaf(
  base: readonly unknown[],
  route: ClientRoute,
): Leaf<unknown, unknown> {
  return {
    queryKey: (input?: unknown) => [...base, input],
    queryOptions: (opts) => {
      const { input, ...rest } = (opts ?? {}) as {
        input?: unknown;
      } & Record<string, unknown>;
      if (input === skipToken) {
        return {
          ...rest,
          enabled: false,
          queryKey: [...base, "skip"],
          queryFn: () => Promise.resolve(undefined),
        };
      }
      return {
        ...rest,
        queryKey: [...base, input],
        queryFn: () => request(route, input) as Promise<unknown>,
      };
    },
    mutationOptions: (opts) => ({
      ...(opts ?? {}),
      mutationFn: (input: unknown) => request(route, input),
    }),
    call: (input?: unknown) => request(route, input),
  } as Leaf<unknown, unknown>;
}

function buildApi(): ApiShape {
  const roles: Record<string, Record<string, Leaf<unknown, unknown>>> = {};
  for (const [role, procedures] of Object.entries(ROUTES)) {
    const leaves: Record<string, Leaf<unknown, unknown>> = {};
    for (const [proc, route] of Object.entries(procedures)) {
      leaves[proc] = makeLeaf([role, proc], route as ClientRoute);
    }
    roles[role] = leaves;
  }
  return roles as unknown as ApiShape;
}

export const api = buildApi();
