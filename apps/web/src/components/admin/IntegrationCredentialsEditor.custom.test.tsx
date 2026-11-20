import type { ReactNode } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import IntegrationCredentialsEditor from "./IntegrationCredentialsEditor";
import type { AdminIntegrationRow } from "$lib/integrations/use-integrations";

const holder = vi.hoisted(() => ({
  reset: vi.fn(),
}));

vi.mock("$lib/api", () => ({
  queryClient: { invalidateQueries: vi.fn() },
}));
vi.mock("$lib/notifications", () => ({
  notify: { success: vi.fn(), error: vi.fn() },
}));
vi.mock("../ActiveEditors", () => ({
  default: ({ children }: { children: ReactNode }) => children,
  useEditingLock: () => ({ blocked: false, onBlockedChange: vi.fn() }),
}));
vi.mock("$lib/integrations/use-integrations", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("$lib/integrations/use-integrations")>();
  const mutation = {
    error: null,
    isPending: false,
    reset: vi.fn(),
    mutate: vi.fn(),
  };
  return {
    ...actual,
    useResetCredentials: () => ({ ...mutation, mutate: holder.reset }),
    useSaveCredentials: () => mutation,
    useValidateCredentials: () => mutation,
  };
});

const row: AdminIntegrationRow = {
  key: "googleAuth",
  label: "Google sign-in",
  description: "Sign in with Google.",
  enabled: true,
  configured: true,
  consequence: "Google sign-in stops.",
  updatedByName: null,
  updatedAt: null,
  version: 1,
  pendingRestart: false,
  overridesLoaded: true,
  credentials: [
    {
      envKey: "GOOGLE_CLIENT_ID",
      customEnvKey: "CUSTOM_GOOGLE_CLIENT_ID",
      label: "Client ID",
      hint: "OAuth client ID.",
      helpUrl: null,
      class: "secret",
      required: true,
      value: null,
      masked: "custo••••••••••••",
      source: "customEnv",
      unreadable: false,
      updatedAt: null,
      updatedByName: null,
    },
  ],
};

afterEach(() => {
  vi.restoreAllMocks();
  holder.reset.mockReset();
});

describe("IntegrationCredentialsEditor custom overrides", () => {
  it("shows the custom variable and confirms a database-only reset", () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<IntegrationCredentialsEditor row={row} />);

    expect(screen.getByText("Custom .env")).toBeInTheDocument();
    expect(screen.getByText("CUSTOM_GOOGLE_CLIENT_ID")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reset to default" }));

    expect(window.confirm).toHaveBeenCalledWith(
      expect.stringContaining("integration switch will not change"),
    );
    expect(holder.reset).toHaveBeenCalledWith("googleAuth", expect.any(Object));
  });
});
