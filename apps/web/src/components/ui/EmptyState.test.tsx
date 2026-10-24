import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import EmptyState, { type EmptyStateIcon } from "./EmptyState";

/**
 * The officer, student, report and instructor empty states used to be five
 * components. They are one now, and the per-call-site differences that a merge
 * can silently drop are the treatment (`plain` vs the bordered `card`), which
 * glyph a site gets, and the student panel's fade opt-out.
 */

describe("EmptyState", () => {
  it("renders the plain treatment with the default inbox glyph", () => {
    const { container } = render(
      <EmptyState title="Nothing here" hint="Add something." />,
    );

    const root = container.firstElementChild as HTMLElement;
    expect(root.getAttribute("role")).toBeNull();
    expect(root.className).toContain("py-14");
    expect(root.querySelector("svg")).toBeTruthy();
    expect(screen.getByText("Nothing here")).toBeTruthy();
    expect(screen.getByText("Add something.")).toBeTruthy();
  });

  it("renders the card treatment as a status region with no glyph", () => {
    const { container } = render(
      <EmptyState
        title="No active academic year"
        hint="Ask an admin to activate a year."
        variant="card"
      />,
    );

    const root = container.firstElementChild as HTMLElement;
    expect(root.getAttribute("role")).toBe("status");
    expect(root.className).toContain("rounded-xl");
    expect(root.querySelector("svg")).toBeNull();
  });

  it("gives each call site its own glyph", () => {
    // The four SVGs used to be inlined in four different components (the inbox
    // and form glyphs twice each). They now share one wrapper, so what has to
    // stay true is that each named glyph still resolves to its own artwork.
    const shapes = (icon: EmptyStateIcon) => {
      const { container, unmount } = render(
        <EmptyState title="x" icon={icon} />,
      );
      const tags = Array.from(container.querySelector("svg")!.children).map(
        (n) => n.tagName,
      );
      unmount();
      return tags;
    };

    expect(shapes("inbox")).toEqual(["polyline", "path"]);
    expect(shapes("user")).toEqual(["path", "circle"]);
    expect(shapes("calendar")).toEqual(["rect", "path", "path", "path"]);
    expect(shapes("form")).toEqual(["path", "path", "path", "path", "path"]);
  });

  it("skips the hint and the action when they are not supplied", () => {
    const { container } = render(
      <EmptyState title="Queue closed — no students waiting." />,
    );

    const root = container.firstElementChild as HTMLElement;
    expect(root.querySelectorAll("p")).toHaveLength(1);
  });

  it("renders the action when supplied", () => {
    render(<EmptyState title="x" action={<button>Do it</button>} />);
    expect(screen.getByRole("button", { name: "Do it" })).toBeTruthy();
  });
});
