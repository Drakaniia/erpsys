import { StrictMode } from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ActiveEditors from "./ActiveEditors";
import { ROUTES } from "$lib/api-routes";

const { touch, leave } = vi.hoisted(() => ({
  touch: vi.fn(),
  leave: vi.fn(),
}));
vi.mock("$lib/api", () => ({
  api: { presence: { touch: { call: touch }, leave: { call: leave } } },
}));

type Editor = { userId: string; name: string };
function deferred() {
  let resolve!: (editors: Editor[]) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<Editor[]>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
async function flush() {
  await act(async () => {});
}
function visibility(hidden: boolean) {
  vi.spyOn(document, "hidden", "get").mockReturnValue(hidden);
  fireEvent(document, new Event("visibilitychange"));
}

beforeEach(() => {
  vi.useFakeTimers();
  touch.mockReset().mockResolvedValue([]);
  leave.mockReset().mockResolvedValue(null);
  vi.spyOn(document, "hidden", "get").mockReturnValue(false);
});
afterEach(async () => {
  cleanup();
  await flush();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("ActiveEditors", () => {
  it("fails closed pending, hides for owner, and preserves the draft through waiting and automatic promotion", async () => {
    const pending = deferred();
    touch.mockReturnValueOnce(pending.promise);
    const blocked = vi.fn();
    render(
      <ActiveEditors resource="department" id="one" onBlockedChange={blocked}>
        <input aria-label="Draft" defaultValue="Unsaved" />
        <button>Save</button>
      </ActiveEditors>,
    );
    expect(screen.getByLabelText("Draft")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    await act(async () => pending.resolve([]));
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getByLabelText("Draft")).toBeEnabled();
    fireEvent.change(screen.getByLabelText("Draft"), {
      target: { value: "My draft" },
    });
    // The server deliberately returns the same account for its second session.
    touch.mockResolvedValueOnce([
      { userId: "same-account", name: "My account" },
    ]);
    await act(async () => {
      vi.advanceTimersByTime(5000);
    });
    expect(screen.getByRole("status")).toHaveTextContent(
      "My account is editing",
    );
    expect(screen.getByLabelText("Draft")).toBeDisabled();
    expect(blocked).toHaveBeenLastCalledWith(true);
    await act(async () => {
      vi.advanceTimersByTime(5000);
    });
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getByLabelText("Draft")).toBeEnabled();
    expect(screen.getByLabelText("Draft")).toHaveValue("My draft");
    expect(blocked).toHaveBeenLastCalledWith(false);
  });

  it("keeps one lease across the dev StrictMode remount so the first editor does not contend with itself", async () => {
    render(
      <StrictMode>
        <ActiveEditors resource="departments" id="one" />
      </StrictMode>,
    );
    await flush();
    expect(touch).toHaveBeenCalledTimes(2);
    expect(touch.mock.calls[1][0]).toEqual(touch.mock.calls[0][0]);
    expect(leave).not.toHaveBeenCalled();
  });

  it("disables an owned draft on heartbeat error, expiry, and hidden-tab recovery", async () => {
    render(
      <ActiveEditors resource="department">
        <input aria-label="Draft" />
      </ActiveEditors>,
    );
    await flush();
    touch.mockRejectedValueOnce(new Error("offline"));
    await act(async () => {
      vi.advanceTimersByTime(5000);
    });
    expect(screen.getByLabelText("Draft")).toBeDisabled();
    await act(async () => {
      vi.advanceTimersByTime(5000);
    });
    expect(screen.getByLabelText("Draft")).toBeEnabled();
    const pending = deferred();
    touch.mockReturnValueOnce(pending.promise);
    await act(async () => {
      vi.advanceTimersByTime(30000);
    });
    expect(screen.getByLabelText("Draft")).toBeDisabled();
    visibility(true);
    visibility(false);
    expect(screen.getByLabelText("Draft")).toBeDisabled();
    await act(async () => pending.resolve([]));
    expect(screen.getByLabelText("Draft")).toBeEnabled();
  });
  it("defines server-anchored touch and leave routes", () => {
    expect(ROUTES.presence.touch).toEqual({
      method: "POST",
      path: "/api/v1/presence",
      serverTimestamp: true,
    });
    expect(ROUTES.presence.leave).toEqual({
      method: "DELETE",
      path: "/api/v1/presence",
      serverTimestamp: true,
    });
  });

  it("touches immediately, polls every 5 seconds with one lease, and leaves on unmount", async () => {
    touch.mockResolvedValue([{ userId: "other", name: "Alice" }]);
    const view = render(
      <ActiveEditors
        resource="departments"
        id="one"
        scope="settings"
        className="custom"
      />,
    );
    expect(touch).toHaveBeenCalledOnce();
    const input = touch.mock.calls[0][0];
    expect(input).toEqual({
      resource: "departments",
      id: "one",
      scope: "settings",
      leaseId: expect.any(String),
    });
    await flush();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Alice is editing. You can edit when they finish.",
    );
    expect(screen.getByRole("status")).toHaveClass("custom");
    await act(async () => {
      vi.advanceTimersByTime(4999);
    });
    expect(touch).toHaveBeenCalledOnce();
    await act(async () => {
      vi.advanceTimersByTime(1);
    });
    expect(touch).toHaveBeenCalledTimes(2);
    expect(touch).toHaveBeenLastCalledWith(input);
    view.unmount();
    await flush();
    await act(async () => {
      vi.advanceTimersByTime(1);
    });
    expect(leave).toHaveBeenCalledExactlyOnceWith(input);
    await act(async () => {
      vi.advanceTimersByTime(10000);
    });
    expect(touch).toHaveBeenCalledTimes(2);
  });

  it("renders nothing for no other editors and supports collection targets", async () => {
    render(<ActiveEditors resource="departments" />);
    await flush();
    expect(screen.queryByRole("status")).toBeNull();
    expect(touch).toHaveBeenCalledWith({
      resource: "departments",
      leaseId: expect.any(String),
    });
  });

  it("does not touch or leave while disabled and hides immediately when disabled", async () => {
    const view = render(
      <ActiveEditors resource="departments" enabled={false} />,
    );
    await act(async () => {
      vi.advanceTimersByTime(10000);
    });
    expect(touch).not.toHaveBeenCalled();
    expect(leave).not.toHaveBeenCalled();
    touch.mockResolvedValue([{ userId: "other", name: "Alice" }]);
    view.rerender(<ActiveEditors resource="departments" />);
    await flush();
    expect(screen.getByRole("status")).toHaveTextContent("Alice");
    view.rerender(<ActiveEditors resource="departments" enabled={false} />);
    expect(screen.queryByRole("status")).toBeNull();
    await flush();
    await act(async () => {
      vi.advanceTimersByTime(1);
    });
    expect(leave).toHaveBeenCalledOnce();
    await act(async () => {
      vi.advanceTimersByTime(10000);
    });
    expect(touch).toHaveBeenCalledOnce();
  });

  it("never overlaps heartbeats and serializes cleanup after a pending touch", async () => {
    const pending = deferred();
    touch.mockReturnValue(pending.promise);
    const view = render(<ActiveEditors resource="departments" id="one" />);
    await act(async () => {
      vi.advanceTimersByTime(15000);
    });
    expect(touch).toHaveBeenCalledOnce();
    view.unmount();
    expect(leave).not.toHaveBeenCalled();
    await act(async () => {
      vi.advanceTimersByTime(1);
    });
    await act(async () => {
      pending.resolve([{ userId: "late", name: "Late" }]);
    });
    expect(leave).toHaveBeenCalledExactlyOnceWith(touch.mock.calls[0][0]);
    expect(screen.queryByRole("status")).toBeNull();
    expect(touch).toHaveBeenCalledOnce();
  });

  it("leaves even if a pending touch rejects during cleanup", async () => {
    const pending = deferred();
    touch.mockReturnValue(pending.promise);
    const view = render(<ActiveEditors resource="departments" />);
    view.unmount();
    await act(async () => {
      vi.advanceTimersByTime(1);
    });
    await act(async () => {
      pending.reject(new Error("Offline"));
    });
    expect(leave).toHaveBeenCalledOnce();
  });

  it("hides old editors on target switches, ignores late replies, and creates separate leases", async () => {
    touch.mockResolvedValueOnce([{ userId: "old", name: "Old editor" }]);
    const view = render(<ActiveEditors resource="departments" id="one" />);
    await flush();
    expect(screen.getByRole("status")).toHaveTextContent("Old editor");
    const oldInput = touch.mock.calls[0][0];
    const oldPending = deferred();
    touch.mockReturnValueOnce(oldPending.promise);
    await act(async () => {
      vi.advanceTimersByTime(5000);
    });
    const newPending = deferred();
    touch.mockReturnValueOnce(newPending.promise);
    view.rerender(<ActiveEditors resource="departments" id="two" />);
    expect(screen.getByRole("status")).toHaveTextContent(
      "Checking editing access",
    );
    expect(leave).not.toHaveBeenCalled();
    await act(async () => {
      vi.advanceTimersByTime(1);
    });
    expect(touch.mock.calls[2][0].leaseId).not.toBe(oldInput.leaseId);
    await act(async () => {
      oldPending.resolve([{ userId: "old", name: "Stale" }]);
    });
    expect(screen.getByRole("status")).toHaveTextContent(
      "Checking editing access",
    );
    expect(leave).toHaveBeenCalledWith(oldInput);
    await act(async () => {
      newPending.resolve([
        { userId: "new", name: "New editor" },
        { userId: "next", name: "Second editor" },
      ]);
    });
    expect(screen.getByRole("status")).toHaveTextContent(
      "New editor, Second editor is editing",
    );
  });

  it("treats resource and scope changes as new targets", async () => {
    touch.mockResolvedValue([{ userId: "other", name: "Alice" }]);
    const view = render(
      <ActiveEditors resource="departments" id="one" scope="settings" />,
    );
    await flush();
    const pending = deferred();
    touch.mockReturnValue(pending.promise);
    view.rerender(
      <ActiveEditors resource="requirements" id="one" scope="settings" />,
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "Checking editing access",
    );
    expect(touch).toHaveBeenLastCalledWith(
      expect.objectContaining({ resource: "requirements", scope: "settings" }),
    );
    view.rerender(
      <ActiveEditors resource="requirements" id="one" scope="order" />,
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "Checking editing access",
    );
    expect(touch).toHaveBeenLastCalledWith(
      expect.objectContaining({ resource: "requirements", scope: "order" }),
    );
    await act(async () => {
      pending.resolve([]);
    });
  });

  it("pauses while hidden and immediately renews on visibility recovery", async () => {
    visibility(true);
    render(<ActiveEditors resource="departments" />);
    await act(async () => {
      vi.advanceTimersByTime(10000);
    });
    expect(touch).not.toHaveBeenCalled();
    visibility(false);
    await flush();
    expect(touch).toHaveBeenCalledOnce();
    visibility(true);
    await act(async () => {
      vi.advanceTimersByTime(10000);
    });
    expect(touch).toHaveBeenCalledOnce();
    visibility(false);
    await flush();
    expect(touch).toHaveBeenCalledTimes(2);
    await act(async () => {
      vi.advanceTimersByTime(5000);
    });
    expect(touch).toHaveBeenCalledTimes(3);
  });

  it("renews after an in-flight heartbeat on visibility recovery without overlap", async () => {
    const pending = deferred();
    touch.mockReturnValueOnce(pending.promise);
    render(<ActiveEditors resource="departments" />);
    visibility(true);
    visibility(false);
    expect(touch).toHaveBeenCalledOnce();
    await act(async () => {
      pending.resolve([]);
    });
    expect(touch).toHaveBeenCalledTimes(2);
  });

  it("fails closed on errors and recovers next poll", async () => {
    touch.mockRejectedValueOnce(new Error("Offline"));
    render(<ActiveEditors resource="departments" />);
    await flush();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Editing unavailable. Reconnecting before you can edit.",
    );
    await act(async () => {
      vi.advanceTimersByTime(5000);
    });
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("resumes after a cached-page restore and best-effort leaves on unmount", async () => {
    leave.mockRejectedValue(new Error("Closing"));
    const view = render(<ActiveEditors resource="departments" />);
    await flush();
    visibility(true);
    fireEvent(window, new Event("pagehide"));
    await act(async () => {
      vi.advanceTimersByTime(10000);
    });
    expect(touch).toHaveBeenCalledOnce();
    expect(leave).not.toHaveBeenCalled();
    fireEvent(window, new Event("pageshow"));
    visibility(false);
    await flush();
    expect(touch).toHaveBeenCalledTimes(2);
    view.unmount();
    await flush();
    await act(async () => {
      vi.advanceTimersByTime(1);
    });
    expect(leave).toHaveBeenCalledOnce();
  });
});
