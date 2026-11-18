import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import AuthenticatorSection from "./AuthenticatorSection";
import type { AdminAuthenticator } from "$lib/integrations/use-integrations";

const ADMIN: AdminAuthenticator = {
  userId: "admin-test-id",
  name: "Test Admin",
  email: "admin@example.test",
  enrolled: true,
};

function response(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function setup(
  onReset = () => Promise.resolve(response({ data: {} })),
  admin = ADMIN,
) {
  const fetch = vi.fn((_: unknown, init?: RequestInit) =>
    init?.method === "DELETE"
      ? onReset()
      : Promise.resolve(response({ data: [admin] })),
  );
  vi.stubGlobal("fetch", fetch);
  const nativeConfirm = vi.spyOn(window, "confirm");
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <AuthenticatorSection />
    </QueryClientProvider>,
  );
  return {
    nativeConfirm,
    deletes: () => fetch.mock.calls.filter(([, init]) => init?.method === "DELETE"),
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("AuthenticatorSection", () => {
  it("opens an in-app confirmation and cancels without resetting", async () => {
    const { deletes, nativeConfirm } = setup();
    const trigger = await screen.findByRole("button", { name: "Reset" });
    trigger.focus();
    fireEvent.click(trigger);

    const dialog = screen.getByRole("dialog", { name: "Reset authenticator?" });
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(within(dialog).getByText(/Reset the authenticator for Test Admin/)).toBeTruthy();
    expect(within(dialog).getByText(/They will set up a new one at their next unlock/)).toBeTruthy();
    expect(nativeConfirm).not.toHaveBeenCalled();
    expect(deletes()).toHaveLength(0);
    expect(document.activeElement).toBe(within(dialog).getByRole("button", { name: "Cancel" }));

    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(deletes()).toHaveLength(0);
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it("supports Escape and backdrop dismissal and falls back to email", async () => {
    const { deletes } = setup(undefined, { ...ADMIN, name: "" });
    const trigger = await screen.findByRole("button", { name: "Reset" });
    fireEvent.click(trigger);
    expect(screen.getByText(/Reset the authenticator for admin@example.test/)).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();

    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("dialog"));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(deletes()).toHaveLength(0);
  });

  it("resets only after confirmation, blocks dismissal while busy, and closes on success", async () => {
    let complete!: (value: Response) => void;
    const pending = new Promise<Response>((resolve) => { complete = resolve; });
    const { deletes } = setup(() => pending);
    fireEvent.click(await screen.findByRole("button", { name: "Reset" }));
    fireEvent.click(screen.getByRole("button", { name: "Reset authenticator" }));

    const working = await screen.findByRole("button", { name: "Working…" });
    expect((working as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Cancel" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Reset" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(working);
    fireEvent.keyDown(document, { key: "Escape" });
    fireEvent.click(screen.getByRole("dialog"));
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(deletes()).toHaveLength(1);
    expect(String(deletes()[0][0])).toContain(`/authenticators/${ADMIN.userId}`);

    complete(response({ data: {} }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(deletes()).toHaveLength(1);
  });

  it("keeps failures inside the modal and allows retry", async () => {
    const onReset = vi.fn()
      .mockResolvedValueOnce(response({ error: "Reset failed. Try again." }, 500))
      .mockResolvedValueOnce(response({ data: {} }));
    const { deletes } = setup(onReset);
    fireEvent.click(await screen.findByRole("button", { name: "Reset" }));
    fireEvent.click(screen.getByRole("button", { name: "Reset authenticator" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe("Reset failed. Try again.");
    expect(screen.getByRole("dialog").contains(alert)).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Reset authenticator" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(deletes()).toHaveLength(2);
  });
});
