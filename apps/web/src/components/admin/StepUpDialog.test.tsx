import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import StepUpDialog from "./StepUpDialog";
import {
  fetchGateStatus,
  sendEmailCode,
  startEnrollment,
  submitPassword,
  submitPin,
  verifyAuthenticator,
  verifyEmailCode,
} from "$lib/auth/admin-gate";

vi.mock("$lib/auth/admin-gate", () => ({
  fetchGateStatus: vi.fn(),
  gateMessage: (error: { message?: string } | null, fallback: string) =>
    error?.message || fallback,
  sendEmailCode: vi.fn(),
  startEnrollment: vi.fn(),
  submitPassword: vi.fn(),
  submitPin: vi.fn(),
  verifyAuthenticator: vi.fn(),
  verifyEmailCode: vi.fn(),
}));

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(submitPin).mockResolvedValue(null);
  vi.mocked(submitPassword).mockResolvedValue(null);
  vi.mocked(sendEmailCode).mockResolvedValue(null);
  vi.mocked(verifyEmailCode).mockResolvedValue(null);
});

async function enter(label: string, value: string) {
  fireEvent.change(await screen.findByRole("textbox", { name: label }), {
    target: { value },
  });
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
}

describe("authenticator reset confirmation", () => {
  it.each([false, true])(
    "ends after the emailed code without the lost device (passwordless: %s)",
    async (passwordless) => {
      const onDone = vi.fn();
      vi.mocked(fetchGateStatus).mockResolvedValue({
        unlocked: false,
        next: passwordless ? "code" : "password",
        enrolled: true,
      });
      render(
        <StepUpDialog authenticatorReset onDone={onDone} onCancel={vi.fn()} />,
      );
      await enter("Administrator PIN", "123456");
      if (!passwordless) {
        const input = await screen.findByPlaceholderText("Password");
        fireEvent.change(input, { target: { value: "current-password" } });
        fireEvent.click(screen.getByRole("button", { name: "Continue" }));
      }
      await waitFor(() => expect(sendEmailCode).toHaveBeenCalledOnce());
      await enter("Check your email", "654321");
      await waitFor(() => expect(onDone).toHaveBeenCalledOnce());
      expect(verifyAuthenticator).not.toHaveBeenCalled();
      expect(startEnrollment).not.toHaveBeenCalled();
    },
  );

  it("still requires the authenticator for a normal integration unlock", async () => {
    const onDone = vi.fn();
    vi.mocked(fetchGateStatus).mockResolvedValue({
      unlocked: false,
      next: "code",
      enrolled: true,
    });
    render(<StepUpDialog onDone={onDone} onCancel={vi.fn()} />);
    await enter("Administrator PIN", "123456");
    await waitFor(() => expect(sendEmailCode).toHaveBeenCalledOnce());
    await enter("Check your email", "654321");
    expect(
      await screen.findByRole("heading", { name: "Authenticator code" }),
    ).toBeTruthy();
    expect(onDone).not.toHaveBeenCalled();
  });

  it("does not complete recovery when the emailed code is rejected", async () => {
    const onDone = vi.fn();
    vi.mocked(fetchGateStatus).mockResolvedValue({
      unlocked: false,
      next: "code",
      enrolled: true,
    });
    vi.mocked(verifyEmailCode).mockResolvedValue({
      message: "Incorrect code.",
    });
    render(
      <StepUpDialog authenticatorReset onDone={onDone} onCancel={vi.fn()} />,
    );
    await enter("Administrator PIN", "123456");
    await waitFor(() => expect(sendEmailCode).toHaveBeenCalledOnce());
    await enter("Check your email", "654321");
    expect((await screen.findByRole("alert")).textContent).toBe(
      "Incorrect code.",
    );
    expect(onDone).not.toHaveBeenCalled();
  });
});
