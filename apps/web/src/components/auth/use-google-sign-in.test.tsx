import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useGoogleSignIn } from "./use-google-sign-in";

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  session: vi.fn(),
  accounts: vi.fn(),
  social: vi.fn(),
  link: vi.fn(),
}));
vi.mock("react-router", () => ({ useNavigate: () => mocks.navigate }));
vi.mock("$lib/auth-client", () => ({
  authClient: {
    getSession: mocks.session,
    listAccounts: mocks.accounts,
    signIn: { social: mocks.social },
    linkSocial: mocks.link,
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.session.mockResolvedValue({ data: null });
  mocks.social.mockResolvedValue({});
  mocks.link.mockResolvedValue({});
});

function setup(dest: string | null = null) {
  return renderHook(() => useGoogleSignIn({ dest, onError: vi.fn() }));
}

describe("Google sign-in completion wiring", () => {
  it("sends OAuth through the Calendar-aware page with the internal destination", async () => {
    const { result } = setup("/instructor?tab=schedule");
    await act(async () => {
      await result.current.signInWithGoogle();
    });
    const callback = new URL(mocks.social.mock.calls[0][0].callbackURL);
    expect(callback.origin).toBe(window.location.origin);
    expect(callback.pathname).toBe("/loading");
    expect(callback.searchParams.get("provider")).toBe("google");
    expect(callback.searchParams.get("dest")).toBe("/instructor?tab=schedule");
  });

  it("checks Calendar when continuing an existing Google instructor session", async () => {
    mocks.session.mockResolvedValue({
      data: {
        user: {
          id: "instructor",
          email: "instructor@example.com",
          role: "ENROLLMENT_ADVISER",
        },
      },
    });
    mocks.accounts.mockResolvedValue({ data: [{ providerId: "google" }] });
    const { result } = setup();
    await act(async () => {
      await result.current.signInWithGoogle();
    });
    expect(mocks.social).not.toHaveBeenCalled();
    expect(mocks.navigate).toHaveBeenCalledWith(
      "/loading?provider=google&dest=%2Finstructor",
    );
  });

  it("uses the same completion page after Google account linking", async () => {
    mocks.session.mockResolvedValue({
      data: {
        user: {
          id: "instructor",
          email: "instructor@example.com",
          role: "ENROLLMENT_ADVISER",
        },
      },
    });
    mocks.accounts.mockResolvedValue({ data: [{ providerId: "credential" }] });
    const { result } = setup();
    await act(async () => {
      await result.current.signInWithGoogle();
    });
    expect(result.current.linkDialogOpen).toBe(true);
    await act(async () => {
      await result.current.handleLinkConfirm();
    });
    expect(mocks.link).toHaveBeenCalledWith({
      provider: "google",
      callbackURL: `${window.location.origin}/loading?provider=google`,
    });
  });
});
