import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { YearLevel } from "$lib/domain/constants";
import YearLevelChips from "./YearLevelChips";

const bsit: YearLevel[] = ["FIRST", "SECOND", "THIRD", "FOURTH"];

function renderChips(props: {
  selected: YearLevel[];
  taken?: YearLevel[];
  options?: YearLevel[];
}) {
  const onchange = vi.fn();
  render(
    <YearLevelChips
      selected={props.selected}
      options={props.options ?? bsit}
      taken={props.taken ?? []}
      onchange={onchange}
    />,
  );
  return { onchange };
}

describe("YearLevelChips", () => {
  it("selects every level when nothing is held", async () => {
    const user = userEvent.setup();
    const { onchange } = renderChips({ selected: [] });
    await user.click(screen.getByRole("button", { name: "Select all" }));
    expect(onchange).toHaveBeenCalledWith([
      "FIRST",
      "SECOND",
      "THIRD",
      "FOURTH",
    ]);
  });

  it("fills only the free levels, never the ones held elsewhere", async () => {
    const user = userEvent.setup();
    const { onchange } = renderChips({ selected: [], taken: ["THIRD"] });
    await user.click(screen.getByRole("button", { name: "Select all" }));
    expect(onchange).toHaveBeenCalledWith(["FIRST", "SECOND", "FOURTH"]);
  });

  it("reads 'all selected' against the free levels, not the full range", () => {
    renderChips({ selected: ["FIRST", "SECOND", "FOURTH"], taken: ["THIRD"] });
    expect(screen.getByRole("button", { name: "Select all" })).toBeDisabled();
  });

  it("still offers the shortcut when the free levels are not all checked", () => {
    renderChips({ selected: ["FIRST"], taken: ["THIRD"] });
    expect(screen.getByRole("button", { name: "Select all" })).toBeEnabled();
  });

  it("clears the selection back to nothing", async () => {
    const user = userEvent.setup();
    const { onchange } = renderChips({ selected: ["FIRST", "SECOND"] });
    await user.click(screen.getByRole("button", { name: "Clear" }));
    expect(onchange).toHaveBeenCalledWith([]);
  });
});
