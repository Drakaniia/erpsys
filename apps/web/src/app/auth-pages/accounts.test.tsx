import { beforeEach, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { ConnectedAccountsPage } from "./accounts";

const state = vi.hoisted(() => ({
  user: { id: "student", email: "student@example.com", emailVerified: false, role: "STUDENT" },
  email: true,
}));
vi.mock("$lib/auth-client", () => ({ authClient: {
  useSession: () => ({ data: { user: state.user } }),
  listAccounts: async () => ({ data: [] }),
} }));
vi.mock("$lib/integrations/use-integrations", () => ({
  useIntegrations: () => ({ flags: { email: state.email, googleAuth: false } }),
}));
vi.mock("../../components/auth/EmailCodeForm", () => ({
  default: ({ email }: { email: string }) => <button>Verify {email}</button>,
}));
beforeEach(() => { state.user.emailVerified = false; state.email = true; });
const renderPage = () => render(<MemoryRouter><ConnectedAccountsPage /></MemoryRouter>);

it("keeps verification optional and lets users return to the console", () => {
  renderPage();
  expect(screen.getByText(/Verification is optional/)).toBeTruthy();
  expect(screen.getByRole("button", { name: "Verify student@example.com" })).toBeTruthy();
  expect(screen.getByRole("link", { name: "Back to console" })).toHaveAttribute("href", "/student");
});

it("shows verified status without offering another verification", () => {
  state.user.emailVerified = true;
  renderPage();
  expect(screen.getByRole("status")).toHaveTextContent("Email verified: student@example.com");
  expect(screen.queryByRole("button")).toBeNull();
});

it("explains unavailable delivery without blocking account access", () => {
  state.email = false;
  renderPage();
  expect(screen.getByText(/Email delivery is unavailable/)).toBeTruthy();
  expect(screen.getByRole("link", { name: "Back to console" })).toBeTruthy();
});
