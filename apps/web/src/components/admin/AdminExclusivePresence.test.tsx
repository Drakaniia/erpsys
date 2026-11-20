import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import UserRowDialogs from "./UserRowDialogs";
import { api } from "$lib/api";
import { editLeaseHeader } from "$lib/edit-leases";

beforeEach(() => {
  vi.useFakeTimers();
  Object.defineProperty(document, "hidden", {
    configurable: true,
    value: false,
  });
  vi.spyOn(api.presence.leave, "call").mockResolvedValue(undefined);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

const base = {
  roleDialog: null,
  deleteDialog: null,
  reactivateTarget: null,
  purgeTarget: null,
  busy: false,
  selectedPromotableCount: 0,
  selectedDemotableCount: 0,
  selectedCount: 0,
  selectedDeletableCount: 0,
  onConfirmRole: vi.fn(),
  onCloseRole: vi.fn(),
  onConfirmDelete: vi.fn(),
  onCloseDelete: vi.fn(),
  onConfirmReactivate: vi.fn(),
  onCloseReactivate: vi.fn(),
  onConfirmPurge: vi.fn(),
  onClosePurge: vi.fn(),
};

describe("exclusive admin confirmation", () => {
  it("waits for every bulk target, promotes automatically, and keeps Cancel usable", async () => {
    let releaseSecond!: (value: []) => void;
    const second = new Promise<[]>((resolve) => {
      releaseSecond = resolve;
    });
    const touch = vi
      .spyOn(api.presence.touch, "call")
      .mockImplementation(async (input) => {
        if (input?.id === "two") return second;
        return [];
      });
    const props = {
      ...base,
      deleteDialog: {
        targets: [
          { id: "one", name: "One" },
          { id: "two", name: "Two" },
        ],
      },
    };
    const view = render(<UserRowDialogs {...props} />);
    expect(
      screen.getByRole("button", { name: "Delete account" }),
    ).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeEnabled();
    await act(async () => {});
    expect(
      screen.getByRole("button", { name: "Delete account" }),
    ).toBeDisabled();
    expect(JSON.parse(editLeaseHeader())).toHaveLength(2);
    await act(async () => {
      releaseSecond([]);
    });
    expect(screen.queryByRole("status")).toBeNull();
    expect(
      screen.getByRole("button", { name: "Delete account" }),
    ).toBeEnabled();
    touch.mockResolvedValue([
      {
        userId: "same-user",
        name: "My other tab",
        expiresAt: Date.now() + 30000,
      },
    ]);
    await act(async () => {
      vi.advanceTimersByTime(5000);
    });
    expect(screen.getAllByRole("status")[0]).toHaveTextContent(
      "My other tab is editing",
    );
    expect(
      screen.getByRole("button", { name: "Delete account" }),
    ).toBeDisabled();
    touch.mockResolvedValue([]);
    await act(async () => {
      vi.advanceTimersByTime(5000);
    });
    expect(
      screen.getByRole("button", { name: "Delete account" }),
    ).toBeEnabled();
    view.unmount();
    expect(JSON.parse(editLeaseHeader())).toEqual([]);
  });

  it("disables destructive confirmation and text entry while waiting, but permits closing", async () => {
    vi.spyOn(api.presence.touch, "call").mockResolvedValue([
      {
        userId: "same-user",
        name: "Other session",
        expiresAt: Date.now() + 30000,
      },
    ]);
    render(
      <UserRowDialogs {...base} purgeTarget={{ id: "one", name: "One" }} />,
    );
    await act(async () => {});
    expect(
      screen.getByLabelText("Type the account name to confirm"),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Delete permanently" }),
    ).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(base.onClosePurge).toHaveBeenCalled();
  });
});
