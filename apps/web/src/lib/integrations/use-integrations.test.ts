import { createElement, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { INTEGRATIONS_BROADCAST_KEY } from "$lib/perf/cache-policy";

import {
  useAdminIntegrations,
  useIntegrations,
  useSetIntegration,
  type AdminIntegrationRow,
} from "./use-integrations";

type Envelope = { data: unknown };

function answer(payload: Envelope) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      status: 200,
      text: () => Promise.resolve(JSON.stringify(payload)),
    })),
  );
}

/** Held open so the query stays pending for the duration of one test. */
function neverSettles() {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => new Promise<Response>(() => {})),
  );
}

function wrapper(client: QueryClient) {
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client }, children);
}

function client() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
}

const row = (
  key: AdminIntegrationRow["key"],
  enabled = true,
): AdminIntegrationRow => ({
  key,
  label: key,
  description: "",
  enabled,
  configured: true,
  consequence: "",
  updatedByName: null,
  updatedAt: null,
  credentials: [],
  version: 0,
  pendingRestart: false,
  overridesLoaded: true,
});

afterEach(() => vi.unstubAllGlobals());

describe("useIntegrations", () => {
  it("reads every flag as on while the query is in flight", () => {
    neverSettles();
    const { result } = renderHook(() => useIntegrations(), {
      wrapper: wrapper(client()),
    });
    expect(result.current.pending).toBe(true);
    expect(result.current.flags).toEqual({
      turnstile: true,
      r2: true,
      googleAuth: true,
      cloudflareChat: true,
      email: true,
      googleForms: true,
      googleCalendar: true,
    });
    expect(result.current.turnstileSiteKey).toBe("");
    expect(result.current.overridesLoaded).toBe(true);
  });

  it("takes the server's booleans and site key once they land", async () => {
    answer({
      data: {
        flags: {
          turnstile: false,
          r2: true,
          googleAuth: false,
          cloudflareChat: true,
          email: true,
        },
        turnstileSiteKey: "0x4AAA-site-key",
        overridesLoaded: false,
      },
    });
    const { result } = renderHook(() => useIntegrations(), {
      wrapper: wrapper(client()),
    });
    await waitFor(() => expect(result.current.pending).toBe(false));
    expect(result.current.flags.googleAuth).toBe(false);
    expect(result.current.flags.r2).toBe(true);
    expect(result.current.turnstileSiteKey).toBe("0x4AAA-site-key");
    expect(result.current.overridesLoaded).toBe(false);
  });

  it("reads the flags out of the row list an admin session gets", async () => {
    // The GET answers an admin with rows. That caller is the one who flipped
    // the switch, so a row that is off has to read as off — otherwise the
    // login page keeps offering a provider the server now rejects.
    answer({
      data: [
        row("googleAuth", false),
        row("turnstile", false),
        row("r2", true),
        row("cloudflareChat", true),
        row("email", true),
      ],
    });
    const { result } = renderHook(() => useIntegrations(), {
      wrapper: wrapper(client()),
    });
    await waitFor(() => expect(result.current.pending).toBe(false));
    expect(result.current.flags.googleAuth).toBe(false);
    expect(result.current.flags.turnstile).toBe(false);
    expect(result.current.flags.r2).toBe(true);
  });

  it("keeps a key's default when the row list omits it", async () => {
    answer({ data: [row("googleAuth", false)] });
    const { result } = renderHook(() => useIntegrations(), {
      wrapper: wrapper(client()),
    });
    await waitFor(() => expect(result.current.pending).toBe(false));
    expect(result.current.flags.googleAuth).toBe(false);
    expect(result.current.flags.r2).toBe(true);
  });
});

describe("useSetIntegration", () => {
  it("tells the other tabs of the browser that a switch moved", async () => {
    answer({ data: {} });
    window.localStorage.clear();
    const { result } = renderHook(() => useSetIntegration(), {
      wrapper: wrapper(client()),
    });

    await act(async () => {
      result.current.mutate({ key: "googleAuth", enabled: false });
    });

    // A second tab holds its own copy of the flags; this is the only way it
    // learns about the flip.
    await waitFor(() =>
      expect(
        window.localStorage.getItem(INTEGRATIONS_BROADCAST_KEY),
      ).not.toBeNull(),
    );
  });
});

describe("useAdminIntegrations", () => {
  it("keeps the server's row order", async () => {
    answer({ data: [row("googleAuth"), row("r2"), row("turnstile")] });
    const { result } = renderHook(() => useAdminIntegrations(), {
      wrapper: wrapper(client()),
    });
    await waitFor(() => expect(result.current.pending).toBe(false));
    expect(result.current.rows.map((r) => r.key)).toEqual([
      "googleAuth",
      "r2",
      "turnstile",
    ]);
  });
});
