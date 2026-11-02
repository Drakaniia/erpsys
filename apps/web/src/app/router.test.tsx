import { beforeAll, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "react-router";
import { queryClient } from "$lib/api";
import { router } from "./router";

/**
 * Integration check for the ported route table: the real `router` boots, the
 * guards run, and `/` reaches the sign-in page. The server is not
 * running here, so `fetch` is answered locally — an unauthenticated session and
 * an empty API body, which is the state the guards have to survive.
 */
beforeAll(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const body = url.includes("/api/auth/")
        ? "null"
        : JSON.stringify({ data: {} });
      return new Response(body, {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }),
  );
});

function renderApp() {
  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

describe("router (React port)", () => {
  it("sends / straight to the sign-in form once the session resolves", async () => {
    renderApp();
    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: "Sign in to ERPSYS" }),
      ).toBeTruthy();
    });
  });


  it("serves the documentation page to a signed-out visitor", async () => {
    renderApp();
    await router.navigate("/docs");
    await waitFor(() => {
      expect(window.location.pathname).toBe("/docs");
      expect(
        screen.getByRole("heading", {
          level: 1,
          name: "ERPSYS documentation",
        }),
      ).toBeTruthy();
    });
  });

  it("bounces an unauthenticated /student to the login screen", async () => {
    // Mount first: the component guards only run while a RouterProvider is
    // subscribed, so navigating without a render would assert nothing.
    renderApp();
    await router.navigate("/student");
    await waitFor(() => {
      expect(window.location.pathname).toBe("/login");
      expect(window.location.search).toBe("?reason=expired");
    });
  });

  it("folds the retired per-role login URLs into /login", async () => {
    // Old bookmarks and the previous sitemap pointed at /login/student and
    // friends; they must land on the single form, not a blank route.
    renderApp();
    await router.navigate("/login/instructor");
    await waitFor(() => {
      expect(window.location.pathname).toBe("/login");
    });
  });
});
