import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import SimsPanel from "./SimsPanel";
import { isSimsWarm, rememberSimsWarm, SIMS_URL } from "$lib/officer/sims";

/**
 * Officers check balances in SIMS beside the Assessment list. Full screen must
 * reuse the same frame, so a search or login inside SIMS survives the toggle.
 */

describe("SimsPanel", () => {
  it("embeds SIMS and offers a new-tab fallback for its own login", () => {
    render(<SimsPanel />);
    expect(screen.getByTitle("SIMS").getAttribute("src")).toBe(SIMS_URL);
    expect(
      screen
        .getByRole("link", { name: "Open in new tab" })
        .getAttribute("href"),
    ).toBe(SIMS_URL);
  });

  it("toggles full screen without remounting the frame", async () => {
    const user = userEvent.setup();
    render(<SimsPanel />);
    const frame = screen.getByTitle("SIMS");

    await user.click(screen.getByRole("button", { name: "Full screen" }));
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByTitle("SIMS")).toBe(frame);

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByTitle("SIMS")).toBe(frame);
  });

  // Leaving the Assessment tab hides the panel instead of unmounting it; a
  // removed iframe reloads from scratch when it comes back.
  it("keeps the same frame while hidden on other tabs", () => {
    const { rerender, container } = render(<SimsPanel />);
    const frame = container.querySelector("iframe");

    rerender(<SimsPanel hidden />);
    expect(container.querySelector("iframe")).toBe(frame);
    expect(container.querySelector("section")?.className).toBe("hidden");

    rerender(<SimsPanel />);
    expect(container.querySelector("iframe")).toBe(frame);
  });

  // The flag lets the console start loading SIMS on open, after a reload or a
  // trip to another route, for officers who have used it before.
  it("remembers in localStorage that the officer uses SIMS", () => {
    localStorage.clear();
    expect(isSimsWarm()).toBe(false);
    rememberSimsWarm();
    expect(isSimsWarm()).toBe(true);
  });
});
