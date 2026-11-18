import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import EmailCodeForm from "./EmailCodeForm";

const mocks = vi.hoisted(() => ({
  send: vi.fn(), signIn: vi.fn(), verify: vi.fn(),
  integration: { flags: { turnstile: false }, turnstileSiteKey: "" },
}));
vi.mock("$lib/auth-client", () => ({ authClient: {
  emailOtp: { sendVerificationOtp: mocks.send, verifyEmail: mocks.verify },
  signIn: { emailOtp: mocks.signIn },
} }));
vi.mock("$lib/integrations/use-integrations", () => ({ useIntegrations: () => mocks.integration }));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.send.mockResolvedValue({ data: { success: true } });
  mocks.signIn.mockResolvedValue({ data: {} });
  mocks.verify.mockResolvedValue({ data: {} });
  mocks.integration.flags.turnstile = false;
  mocks.integration.turnstileSiteKey = "";
});

describe("EmailCodeForm", () => {
  it("sends a sign-in code and authenticates with the native client", async () => {
    const user = userEvent.setup();
    const success = vi.fn();
    render(<EmailCodeForm onSuccess={success} />);
    await user.type(screen.getByLabelText("Email"), "student@example.com");
    await user.click(screen.getByRole("button", { name: "Send email code" }));
    expect(mocks.send).toHaveBeenCalledWith(expect.objectContaining({ email: "student@example.com", type: "sign-in" }));
    expect(screen.getByRole("button", { name: /Resend in/ })).toBeDisabled();
    await user.type(screen.getByLabelText("Email code"), "123456");
    await user.click(screen.getByRole("button", { name: "Sign in with code" }));
    expect(mocks.signIn).toHaveBeenCalledWith({ email: "student@example.com", otp: "123456" });
    expect(success).toHaveBeenCalledOnce();
    expect(mocks.verify).not.toHaveBeenCalled();
  });

  it("verifies the fixed account email without signing in", async () => {
    const user = userEvent.setup();
    const success = vi.fn();
    render(<EmailCodeForm email="student@example.com" onSuccess={success} />);
    await user.click(screen.getByRole("button", { name: "Send email code" }));
    expect(mocks.send).toHaveBeenCalledWith(expect.objectContaining({ email: "student@example.com", type: "email-verification" }));
    await user.type(screen.getByLabelText("Email code"), "654321");
    await user.click(screen.getByRole("button", { name: "Verify email" }));
    expect(mocks.verify).toHaveBeenCalledWith({ email: "student@example.com", otp: "654321" });
    expect(mocks.signIn).not.toHaveBeenCalled();
    expect(success).toHaveBeenCalledOnce();
  });

  it("shows delivery failures and permits retry", async () => {
    mocks.send.mockResolvedValueOnce({ error: { message: "Email delivery is unavailable." } });
    const user = userEvent.setup();
    render(<EmailCodeForm email="student@example.com" onSuccess={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Send email code" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Email delivery is unavailable.");
    expect(screen.getByRole("button", { name: "Send email code" })).toBeEnabled();
    expect(screen.queryByLabelText("Email code")).toBeNull();
  });

  it("keeps the user on the form when a code is rejected", async () => {
    mocks.verify.mockResolvedValueOnce({ error: { message: "Invalid OTP" } });
    const user = userEvent.setup();
    const success = vi.fn();
    render(<EmailCodeForm email="student@example.com" onSuccess={success} />);
    await user.click(screen.getByRole("button", { name: "Send email code" }));
    await user.type(screen.getByLabelText("Email code"), "123456");
    await user.click(screen.getByRole("button", { name: "Verify email" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Invalid OTP");
    expect(success).not.toHaveBeenCalled();
  });
});
