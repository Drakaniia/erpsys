import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { DOC_SECTIONS, DocsPage } from "./docs-page";

function renderDocs() {
  return render(
    <MemoryRouter initialEntries={["/docs"]}>
      <DocsPage />
    </MemoryRouter>,
  );
}

describe("DocsPage", () => {
  it("renders the guide headline and every documented section", () => {
    const { container } = renderDocs();

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "ERPSYS documentation",
      }),
    ).toBeTruthy();

    for (const section of DOC_SECTIONS) {
      expect(container.querySelector(`#${section.id}`)).not.toBeNull();
    }
  });

  it("lists all six enrollment steps and all four account types", () => {
    const { container } = renderDocs();

    expect(container.querySelectorAll("#steps ol > li")).toHaveLength(6);
    expect(container.querySelectorAll("#who-its-for .grid > div")).toHaveLength(
      4,
    );
  });

  it("marks the first section as current before any scrolling", () => {
    renderDocs();

    const current = screen.getAllByRole("link", {
      name: "What ERPSYS is",
    })[0];
    expect(current!.getAttribute("aria-current")).toBe("location");
  });

  it("offers a sign-in link and in-page section links", () => {
    renderDocs();

    const signIn = screen.getByRole("link", { name: "Sign in" });
    expect(signIn.getAttribute("href")).toBe("/login");

    const queueLink = screen.getAllByRole("link", {
      name: "The enrollment queue",
    })[0];
    expect(queueLink!.getAttribute("href")).toBe("#queue");
  });
});
