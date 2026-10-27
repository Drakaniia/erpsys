import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import LoginCard from "./LoginCard";

/**
 * The login card is the one surface an unauthenticated visitor sees, so the two
 * integration flags that reach it have to be the only thing deciding whether
 * the Google button and the Turnstile widget exist.
 */
const integration = vi.hoisted(() => ({
  flags: {
    turnstile: true,
    r2: true,
    googleAuth: true,
    cloudflareChat: true,
    email: true,
  },
  turnstileSiteKey: "test-site-key",
  overridesLoaded: true,
  pending: false,
}));

vi.mock("$lib/integrations/use-integrations", () => ({
  useIntegrations: () => integration,
}));

beforeAll(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response("null", {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    ),
  );
});

afterEach(() => {
  integration.flags = {
    turnstile: true,
    r2: true,
    googleAuth: true,
    cloudflareChat: true,
    email: true,
  };
  integration.turnstileSiteKey = "test-site-key";
  integration.pending = false;
});

function renderCard() {
  return render(
    <MemoryRouter initialEntries={["/login"]}>
      <LoginCard />
    </MemoryRouter>,
  );
}

const googleButton = () =>
  screen.queryByRole("button", { name: /continue with google/i });
const turnstile = () => screen.queryByTestId("turnstile-container");

describe("LoginCard", () => {
  it("is one form for every role, with student sign-up beside it", () => {
    // Role decides the destination after sign-in, so the card must not ask
    // the visitor which kind of account they have.
    renderCard();
    expect(
      screen.getByRole("heading", { name: "Sign in to ERPSYS" }),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: /student|instructor|officer/i }))
      .toBeNull();
    expect(
      screen
        .getByRole("link", { name: "Create an account" })
        .getAttribute("href"),
    ).toBe("/login/register");
  });
});

describe("LoginCard integration flags", () => {
  it("renders both when googleAuth and turnstile are on", () => {
    renderCard();
    expect(googleButton()).toBeTruthy();
    expect(turnstile()).toBeTruthy();
  });

  it("renders no Google button when googleAuth is off", () => {
    integration.flags.googleAuth = false;
    renderCard();
    expect(googleButton()).toBeNull();
  });

  it("renders no Turnstile when turnstile is off", () => {
    integration.flags.turnstile = false;
    renderCard();
    expect(turnstile()).toBeNull();
    // The dashed placeholder counts as a rendered widget too.
    expect(screen.queryByText(/verification disabled/i)).toBeNull();
  });

  it("renders no Turnstile when the API sends an empty site key", () => {
    integration.turnstileSiteKey = "";
    renderCard();
    expect(turnstile()).toBeNull();
  });

  it("keeps both while the query is pending", () => {
    // While pending the flags are all-true by contract. Hiding anything here
    // is what makes a slow network flicker features off the login page.
    integration.pending = true;
    renderCard();
    expect(googleButton()).toBeTruthy();
    expect(turnstile()).toBeTruthy();
  });
});
