import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import IntegrationCredentialsEditor from "./IntegrationCredentialsEditor";
import type { AdminIntegrationRow } from "$lib/integrations/use-integrations";

const ROW: AdminIntegrationRow = {
  key: "r2",
  label: "File uploads",
  description: "Upload evidence photos and documents.",
  enabled: true,
  configured: true,
  consequence: "New uploads are refused.",
  updatedByName: "Ana Reyes",
  updatedAt: null,
  version: 2,
  pendingRestart: false,
  overridesLoaded: true,
  credentials: [
    {
      envKey: "R2_BUCKET",
      label: "Bucket",
      hint: "Standard-class bucket that stores evidence files.",
      helpUrl: null,
      class: "plain",
      required: true,
      value: "erpsys-prod",
      masked: null,
      source: "env",
      unreadable: false,
      updatedAt: null,
      updatedByName: null,
    },
    {
      envKey: "R2_SECRET_ACCESS_KEY",
      label: "Secret access key",
      hint: "Secret half of the same R2 token.",
      helpUrl: "https://dash.cloudflare.com/",
      class: "secret",
      required: true,
      value: null,
      masked: "secre••••••••••••",
      source: "stored",
      unreadable: false,
      updatedAt: null,
      updatedByName: null,
    },
  ],
};

function renderEditor(row: AdminIntegrationRow = ROW) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <IntegrationCredentialsEditor row={row} />
    </QueryClientProvider>,
  );
}

function stubFetch(answer: (url: string, init?: RequestInit) => Response) {
  const mock = vi.fn(async (input: unknown, init?: RequestInit) =>
    answer(String(input), init),
  );
  vi.stubGlobal("fetch", mock);
  return mock;
}

function savedRow(version: number, pendingRestart: boolean): Response {
  return new Response(
    JSON.stringify({
      data: { ...ROW, version, pendingRestart },
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

afterEach(() => vi.unstubAllGlobals());

describe("IntegrationCredentialsEditor", () => {
  it("shows plaintext for a plain field and only a mask for a secret", () => {
    stubFetch(() => new Response(null, { status: 200 }));
    renderEditor();

    expect(screen.getByDisplayValue("erpsys-prod")).toBeTruthy();
    expect(screen.getByText("secre••••••••••••")).toBeTruthy();
    expect(screen.getByText("Credential set")).toBeTruthy();
    expect(screen.getByText("Stored")).toBeTruthy();
    expect(screen.getByText("Standard-class bucket that stores evidence files."))
      .toBeTruthy();

    expect(
      (screen.getByRole("button", { name: "Save" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });

  it("replace gives an empty password field and Cancel restores the mask", () => {
    stubFetch(() => new Response(null, { status: 200 }));
    renderEditor();

    fireEvent.click(screen.getByRole("button", { name: "Replace" }));

    const input = screen.getByLabelText(
      "New Secret access key",
    ) as HTMLInputElement;
    expect(input.type).toBe("password");
    expect(input.value).toBe("");
    expect(screen.queryByText("secre••••••••••••")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByText("secre••••••••••••")).toBeTruthy();
  });

  it("sends only the changed field and reports the restart inline", async () => {
    const mock = stubFetch(() => savedRow(3, true));
    renderEditor();

    fireEvent.change(screen.getByDisplayValue("erpsys-prod"), {
      target: { value: "erpsys-new" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Saved · restart required")).toBeTruthy();

    const [, init] = mock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toEqual({
      version: 2,
      values: { R2_BUCKET: "erpsys-new" },
    });
  });

  it("shows the provider reason and Retry re-sends the identical body", async () => {
    let call = 0;
    const mock = stubFetch(() => {
      call += 1;
      return new Response(
        JSON.stringify({
          error: "bucket not found",
          data: { failures: [{ key: "R2_BUCKET", reason: "bucket not found" }] },
        }),
        { status: 422, headers: { "content-type": "application/json" } },
      );
    });
    renderEditor();

    fireEvent.change(screen.getByDisplayValue("erpsys-prod"), {
      target: { value: "erpsys-new" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("R2_BUCKET");
    expect(alert.textContent).toContain("bucket not found");

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(mock).toHaveBeenCalledTimes(2));

    const bodies = mock.mock.calls.map(([, init]) =>
      String((init as RequestInit).body),
    );
    expect(bodies[0]).toBe(bodies[1]);
    expect(call).toBe(2);
  });

  it("warns when the stored group cannot be decrypted", () => {
    stubFetch(() => new Response(null, { status: 200 }));
    renderEditor({
      ...ROW,
      credentials: ROW.credentials.map((field) => ({
        ...field,
        unreadable: true,
      })),
    });

    expect(
      screen.getByText(
        "Stored credentials cannot be read — the encryption key changed. Re-enter them, or reset to .env.",
      ),
    ).toBeTruthy();
  });
});
