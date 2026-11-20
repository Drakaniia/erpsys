import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ReactivateAccountDialog from "./ReactivateAccountDialog";

describe("ReactivateAccountDialog", () => {
  it("explains the scope and requires confirmation", () => {
    const onconfirm = vi.fn();
    const onclose = vi.fn();
    render(
      <ReactivateAccountDialog
        open
        name="Student One"
        onconfirm={onconfirm}
        onclose={onclose}
      />,
    );
    expect(
      screen.getByRole("dialog", { name: "Reactivate Student One?" }),
    ).toHaveTextContent("existing role");
    expect(screen.getByRole("dialog")).toHaveTextContent(
      "will not be restored",
    );
    expect(onconfirm).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();
    fireEvent.click(screen.getByRole("button", { name: "Reactivate account" }));
    expect(onconfirm).toHaveBeenCalledOnce();
  });

  it("supports cancel and Escape", () => {
    const onclose = vi.fn();
    render(
      <ReactivateAccountDialog
        open
        name="Student"
        onconfirm={vi.fn()}
        onclose={onclose}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onclose).toHaveBeenCalledTimes(2);
  });

  it("prevents repeat submissions and dismissal while working", () => {
    const onconfirm = vi.fn();
    const onclose = vi.fn();
    render(
      <ReactivateAccountDialog
        open
        name="Student"
        busy
        onconfirm={onconfirm}
        onclose={onclose}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Reactivating…" }),
    ).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Reactivating…" }));
    fireEvent.click(screen.getByRole("dialog"));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onconfirm).not.toHaveBeenCalled();
    expect(onclose).not.toHaveBeenCalled();
  });

  it("renders nothing when closed", () => {
    render(
      <ReactivateAccountDialog
        open={false}
        name="Student"
        onconfirm={vi.fn()}
        onclose={vi.fn()}
      />,
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
