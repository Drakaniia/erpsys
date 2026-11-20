import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import UserTableRow from "./UserTableRow";
import type { UseUserAdminReturn } from "./use-user-admin";

function setup(id: string, blocked = false) {
  const item = {
    id,
    name: "Admin",
    email: "admin@example.test",
    role: "ADMIN",
    blocked,
    joinedAt: new Date().toISOString(),
  };
  const askDelete = vi.fn();
  const setPurgeTarget = vi.fn();
  const setReactivateTarget = vi.fn();
  const admin = {
    askDelete,
    setPurgeTarget,
    setReactivateTarget,
  } as unknown as UseUserAdminReturn;
  render(
    <table>
      <tbody>
        <UserTableRow
          item={item}
          myId="self"
          selected={false}
          onToggle={() => {}}
          admin={admin}
        />
      </tbody>
    </table>,
  );
  return { item, askDelete, setPurgeTarget, setReactivateTarget };
}

describe("admin deletion actions", () => {
  it("allows deleting another admin without offering admin promotion", () => {
    const { item, askDelete } = setup("other");
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(askDelete).toHaveBeenCalledWith(item);
    expect(
      screen.queryByRole("button", { name: "Promote to admin" }),
    ).toBeNull();
  });

  it.each([false, true])(
    "disables self-deletion when blocked is %s",
    (blocked) => {
      setup("self", blocked);
      expect(
        screen.getByRole("button", {
          name: blocked ? "Delete permanently" : "Delete",
        }),
      ).toBeDisabled();
    },
  );

  it("offers reactivation only for disabled accounts", () => {
    setup("other");
    expect(
      screen.queryByRole("button", { name: "Reactivate account" }),
    ).toBeNull();
  });

  it("opens confirmation to reactivate a disabled account", () => {
    const { item, setReactivateTarget } = setup("other", true);
    fireEvent.click(screen.getByRole("button", { name: "Reactivate account" }));
    expect(setReactivateTarget).toHaveBeenCalledExactlyOnceWith(item);
  });

  it("allows purging another blocked admin", () => {
    const { item, setPurgeTarget } = setup("other", true);
    fireEvent.click(screen.getByRole("button", { name: "Delete permanently" }));
    expect(setPurgeTarget).toHaveBeenCalledWith(item);
  });
});
