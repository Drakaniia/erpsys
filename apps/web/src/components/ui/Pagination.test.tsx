import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import Pagination from "./Pagination";

/**
 * The admin users table and the officer submission list used to be two
 * near-identical components; they now share this one. What breaks silently if
 * that merge is wrong is the per-call-site chrome -- the two guards, the two
 * looks, and the count wording -- so that is what is asserted.
 */

const noop = () => {};

describe("Pagination", () => {
  it("always shows the select and arrows in the bar look", () => {
    render(
      <Pagination
        page={1}
        pageSize={25}
        total={3}
        totalPages={1}
        onpagechange={noop}
        onpagesizechange={noop}
        label={(n: number) => `${n} users`}
      />,
    );

    expect(screen.getByLabelText("Per page")).toBeTruthy();
    expect(screen.getByLabelText("Previous page")).toBeTruthy();
    expect(screen.getByLabelText("Next page")).toBeTruthy();
    // The bar look has no landmark; the inline look wraps the arrows in a nav.
    expect(screen.queryByLabelText("Pagination")).toBeNull();
  });

  it("honours both guards", () => {
    render(
      <Pagination
        page={1}
        pageSize={25}
        total={10}
        totalPages={1}
        onpagechange={noop}
        onpagesizechange={noop}
        label={(n: number) => `${n} total`}
        variant="inline"
        hideSizeSelect
        hideNav
      />,
    );

    expect(screen.queryByLabelText("Per page")).toBeNull();
    expect(screen.queryByLabelText("Pagination")).toBeNull();
  });

  it("labels the count from the call site and paginates the inline look", async () => {
    const user = userEvent.setup();
    const seen: number[] = [];
    render(
      <Pagination
        page={2}
        pageSize={25}
        total={1000}
        totalPages={4}
        onpagechange={(n: number) => seen.push(n)}
        onpagesizechange={noop}
        label={(n: number) => `${n.toLocaleString()} user${n === 1 ? "" : "s"}`}
        variant="inline"
        hideSizeSelect={false}
        hideNav={false}
      />,
    );

    expect(screen.getByText("1,000 users")).toBeTruthy();
    expect(screen.getByLabelText("Pagination")).toBeTruthy();

    await user.click(screen.getByLabelText("Next page"));
    await user.click(screen.getByLabelText("Previous page"));
    expect(seen).toEqual([3, 1]);
  });
});
