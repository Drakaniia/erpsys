import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import IntegrationCredentialsEditor from "./IntegrationCredentialsEditor";

import type { AdminIntegrationRow } from "$lib/integrations/use-integrations";
import { notify } from "$lib/notifications";

vi.mock("$lib/notifications", () => ({
  notify: { success: vi.fn(), error: vi.fn() },
}));

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

/** The dry run answers with what each field would end up as. */
function validated(): Response {
  return new Response(
    JSON.stringify({
      data: {
        key: "r2",
        version: 2,
        fields: [
          { envKey: "R2_BUCKET", set: true, source: "draft" },
          { envKey: "R2_SECRET_ACCESS_KEY", set: true, source: "stored" },
        ],
      },
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

function rejected(failures: { key: string; reason: string }[]): Response {
  return new Response(
    JSON.stringify({
      error: failures.length === 1 ? failures[0].reason : "Credentials rejected.",
      data: { failures },
    }),
    { status: 422, headers: { "content-type": "application/json" } },
  );
}

const isValidate = (url: string) => url.endsWith("/credentials/validate");

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

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

  it("keeps Save disabled until Validate approves the exact drafts", async () => {
    stubFetch(() => validated());
    renderEditor();

    const saveButton = () =>
      screen.getByRole("button", { name: "Save" }) as HTMLButtonElement;
    expect(saveButton().disabled).toBe(true);

    fireEvent.change(screen.getByDisplayValue("erpsys-prod"), {
      target: { value: "erpsys-new" },
    });
    // Dirty is not enough — the gate is a pass on these exact values.
    expect(saveButton().disabled).toBe(true);
    expect(
      screen.getByText("Validate these values before saving."),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Validate" }));
    expect(await screen.findByText("Validated — safe to save.")).toBeTruthy();
    expect(notify.success).toHaveBeenCalledWith(
      "Credentials validated. Nothing has been saved.",
    );
    expect(saveButton().disabled).toBe(false);

    // Any further edit revokes the pass.
    fireEvent.change(screen.getByDisplayValue("erpsys-new"), {
      target: { value: "erpsys-newer" },
    });
    expect(saveButton().disabled).toBe(true);
  });

  it("sends only the changed field and reports the restart inline", async () => {
    const mock = stubFetch((url) =>
      isValidate(url) ? validated() : savedRow(3, true),
    );
    renderEditor();

    fireEvent.change(screen.getByDisplayValue("erpsys-prod"), {
      target: { value: "erpsys-new" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Validate" }));
    await screen.findByText("Validated — safe to save.");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Saved · restart required")).toBeTruthy();

    const saved = mock.mock.calls.find(([url]) => !isValidate(String(url)));
    const [, init] = saved as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toEqual({
      version: 2,
      values: { R2_BUCKET: "erpsys-new" },
    });
  });

  it("surfaces a rejected group inline and keeps Save locked", async () => {
    const mock = stubFetch(() =>
      rejected([{ key: "R2_BUCKET", reason: "bucket not found" }]),
    );
    renderEditor();

    fireEvent.change(screen.getByDisplayValue("erpsys-prod"), {
      target: { value: "erpsys-new" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Validate" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("R2_BUCKET");
    expect(alert.textContent).toContain("bucket not found");
    expect(notify.error).toHaveBeenCalledWith("Validation failed: bucket not found");
    expect(
      (screen.getByRole("button", { name: "Save" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);

    // The offending field is marked for the eye, not only in the summary.
    const bucket = screen.getByLabelText("Bucket") as HTMLInputElement;
    expect(bucket.getAttribute("aria-invalid")).toBe("true");
    const describedBy = bucket.getAttribute("aria-describedby");
    expect(document.getElementById(String(describedBy))?.textContent).toBe(
      "bucket not found",
    );

    expect(mock.mock.calls.every(([url]) => isValidate(String(url)))).toBe(true);
  });

  it("drops a stale failure once the admin edits the field", async () => {
    stubFetch(() => rejected([{ key: "R2_BUCKET", reason: "bucket not found" }]));
    renderEditor();

    fireEvent.change(screen.getByDisplayValue("erpsys-prod"), {
      target: { value: "erpsys-new" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Validate" }));
    await screen.findByRole("alert");

    fireEvent.change(screen.getByDisplayValue("erpsys-new"), {
      target: { value: "erpsys-fixed" },
    });
    expect(screen.queryByRole("alert")).toBeNull();
    expect(
      screen.getByLabelText("Bucket").getAttribute("aria-invalid"),
    ).toBeNull();
  });

  it("re-sends the identical body when the save itself fails", async () => {
    const mock = stubFetch((url) =>
      isValidate(url)
        ? validated()
        : rejected([{ key: "R2_BUCKET", reason: "bucket not found" }]),
    );
    renderEditor();

    fireEvent.change(screen.getByDisplayValue("erpsys-prod"), {
      target: { value: "erpsys-new" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Validate" }));
    await screen.findByText("Validated — safe to save.");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await screen.findByRole("alert");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(mock).toHaveBeenCalledTimes(3));

    const bodies = mock.mock.calls
      .filter(([url]) => !isValidate(String(url)))
      .map(([, init]) => String((init as RequestInit).body));
    expect(bodies).toHaveLength(2);
    expect(bodies[0]).toBe(bodies[1]);
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
