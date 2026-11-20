import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import FilterDropdown from "./FilterDropdown";
import MultiSelectDropdown from "./MultiSelectDropdown";

const options = [
  { value: "all", label: "All courses" },
  { value: "cs", label: "Computer science" },
  { value: "it", label: "Information technology" },
];

function Single() {
  const [value, setValue] = useState("all");
  return (
    <>
      <FilterDropdown
        ariaLabel="Course"
        options={options}
        value={value}
        onchange={setValue}
      />
      <button>Next field</button>
    </>
  );
}

describe("FilterDropdown", () => {
  it("selects by keyboard and restores focus", async () => {
    const user = userEvent.setup();
    render(<Single />);
    const trigger = screen.getByRole("combobox", { name: "Course" });
    await user.click(trigger);
    expect(screen.getByRole("listbox")).toHaveAttribute(
      "id",
      trigger.getAttribute("aria-controls"),
    );
    await user.keyboard("{End}{Enter}");
    expect(trigger).toHaveTextContent("Information technology");
    expect(trigger).toHaveFocus();
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("supports typeahead and Tab to the next field", async () => {
    const user = userEvent.setup();
    render(<Single />);
    await user.click(screen.getByRole("combobox"));
    await user.keyboard("comp");
    expect(
      screen.getByRole("option", { name: "Computer science" }),
    ).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("button", { name: "Next field" })).toHaveFocus();
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("dismisses on outside press and consumes Escape before the enclosing dialog", async () => {
    const user = userEvent.setup();
    const escape = vi.fn();
    render(
      <div onKeyDown={escape}>
        <Single />
      </div>,
    );
    await user.click(screen.getByRole("combobox"));
    await user.keyboard("{Escape}");
    expect(escape).not.toHaveBeenCalled();
    expect(screen.getByRole("combobox")).toHaveFocus();
    await user.click(screen.getByRole("combobox"));
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("does not open disabled, fieldset-disabled, or empty controls", async () => {
    const user = userEvent.setup();
    render(
      <>
        <FilterDropdown
          ariaLabel="Disabled"
          options={options}
          value="all"
          onchange={vi.fn()}
          disabled
        />
        <fieldset disabled>
          <FilterDropdown
            ariaLabel="Inherited"
            options={options}
            value="all"
            onchange={vi.fn()}
          />
        </fieldset>
        <FilterDropdown
          ariaLabel="Empty"
          options={[]}
          value=""
          onchange={vi.fn()}
        />
      </>,
    );
    for (const trigger of screen.getAllByRole("combobox"))
      await user.click(trigger);
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("uses the browser top layer without moving outside its dialog DOM scope", async () => {
    const show = vi.fn(function (this: HTMLElement) {
      this.style.display = "block";
    });
    const hide = vi.fn();
    const originalShow = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      "showPopover",
    );
    const originalHide = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      "hidePopover",
    );
    Object.defineProperty(HTMLElement.prototype, "showPopover", {
      configurable: true,
      value: show,
    });
    Object.defineProperty(HTMLElement.prototype, "hidePopover", {
      configurable: true,
      value: hide,
    });
    try {
      const user = userEvent.setup();
      render(<Single />);
      await user.click(screen.getByRole("combobox"));
      expect(show).toHaveBeenCalledOnce();
      expect(screen.getByRole("listbox")).toHaveAttribute("popover", "manual");
      await user.keyboard("{Escape}");
      expect(screen.queryByRole("listbox")).toBeNull();
    } finally {
      if (originalShow)
        Object.defineProperty(
          HTMLElement.prototype,
          "showPopover",
          originalShow,
        );
      else
        delete (HTMLElement.prototype as { showPopover?: unknown }).showPopover;
      if (originalHide)
        Object.defineProperty(
          HTMLElement.prototype,
          "hidePopover",
          originalHide,
        );
      else
        delete (HTMLElement.prototype as { hidePopover?: unknown }).hidePopover;
    }
  });
});

it("keeps multi-select open while toggling and clearing selections", async () => {
  function Multi() {
    const [selected, setSelected] = useState<string[]>([]);
    return (
      <MultiSelectDropdown
        label="Courses"
        placeholder="Courses"
        options={options}
        selected={selected}
        onchange={setSelected}
      />
    );
  }
  const user = userEvent.setup();
  render(<Multi />);
  await user.click(screen.getByRole("button", { name: "Courses" }));
  await user.click(screen.getByRole("option", { name: "Computer science" }));
  expect(
    screen.getByRole("option", { name: "Computer science" }),
  ).toHaveAttribute("aria-selected", "true");
  await user.click(screen.getByRole("button", { name: "Clear courses" }));
  expect(
    screen.getByRole("option", { name: "Computer science" }),
  ).toHaveAttribute("aria-selected", "false");
  await user.keyboard("{Escape}");
  expect(screen.getByRole("button", { name: "Courses" })).toHaveFocus();
});
