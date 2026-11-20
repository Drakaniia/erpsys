import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ConsoleOnboarding, { OnboardingHelp } from "./ConsoleOnboarding";

const tips = [
  {
    id: "queue",
    title: "Queue tip",
    body: "Switch queues here.",
    context: "Open a department.",
  },
  {
    id: "confirm",
    title: "Confirm tip",
    body: "Review the student's record.",
    context: "Open confirmation.",
  },
];

class IntersectionMock {
  static instances: IntersectionMock[] = [];
  observed = new Set<Element>();
  callback: IntersectionObserverCallback;
  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback;
    IntersectionMock.instances.push(this);
  }
  observe(node: Element) {
    this.observed.add(node);
  }
  unobserve(node: Element) {
    this.observed.delete(node);
  }
  disconnect() {
    this.observed.clear();
  }
  update(node: Element, isIntersecting: boolean) {
    this.callback(
      [
        {
          target: node,
          isIntersecting,
          intersectionRatio: Number(isIntersecting),
        } as IntersectionObserverEntry,
      ],
      this as unknown as IntersectionObserver,
    );
  }
}

async function show(node: Element) {
  await waitFor(() =>
    expect(IntersectionMock.instances.at(-1)?.observed.has(node)).toBe(true),
  );
  act(() => IntersectionMock.instances.at(-1)?.update(node, true));
}

function Console({
  dialog = false,
  account = "adviser",
  onAction,
}: {
  dialog?: boolean;
  account?: string;
  onAction?: () => void;
}) {
  return (
    <ConsoleOnboarding
      key={account}
      surface="instructor"
      accountId={account}
      tips={tips}
    >
      <OnboardingHelp />
      <p id="existing">Existing description</p>
      <button
        data-onboarding-tip="queue"
        aria-describedby="existing"
        onClick={onAction}
      >
        Queue
      </button>
      {dialog && (
        <div role="dialog" aria-label="Confirmation" aria-modal="true">
          <button data-onboarding-tip="confirm">Confirm</button>
        </div>
      )}
    </ConsoleOnboarding>
  );
}

beforeEach(() => {
  localStorage.clear();
  IntersectionMock.instances = [];
  vi.stubGlobal("IntersectionObserver", IntersectionMock);
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
});

afterEach(() => vi.unstubAllGlobals());

describe("Console onboarding", () => {
  it("waits until a control is visible, preserves focus and still lets the control work", async () => {
    const onAction = vi.fn();
    render(<Console onAction={onAction} />);
    const queue = screen.getByRole("button", { name: "Queue" });
    const help = screen.getByRole("button", { name: "Help" });
    help.focus();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    await show(queue);
    expect(screen.getByRole("status")).toHaveTextContent("Queue tip");
    expect(help).toHaveFocus();
    expect(queue).toHaveAccessibleDescription(/Existing description Queue tip/);
    fireEvent.click(queue);
    expect(onAction).toHaveBeenCalledOnce();
    fireEvent.click(
      screen.getByRole("button", { name: "Dismiss tip: Queue tip" }),
    );
    expect(queue).toHaveAccessibleDescription("Existing description");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("persists individual tips, isolates accounts, and replays from Help", async () => {
    const first = render(<Console />);
    await show(screen.getByRole("button", { name: "Queue" }));
    first.unmount();
    const second = render(<Console />);
    await show(screen.getByRole("button", { name: "Queue" }));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    act(() => window.dispatchEvent(new Event("instructor:open-onboarding")));
    const help = screen.getByRole("complementary", { name: "Console tips" });
    expect(help).toHaveFocus();
    expect(within(help).getByText("Confirm tip").tagName).toBe("SUMMARY");
    fireEvent.click(within(help).getByRole("button", { name: /Queue tip/ }));
    expect(screen.getByRole("status")).toHaveTextContent("Queue tip");
    second.rerender(<Console account="another-adviser" />);
    await show(screen.getByRole("button", { name: "Queue" }));
    expect(screen.getByRole("status")).toHaveTextContent("Queue tip");
  });

  it("can replay a tip from Help when its control becomes available later", async () => {
    localStorage.setItem(
      "erpsys:onboarding:v1:instructor:adviser",
      JSON.stringify(["confirm"]),
    );
    const { rerender } = render(<Console />);
    fireEvent.click(screen.getByRole("button", { name: "Help" }));
    fireEvent.click(screen.getByText("Confirm tip"));
    fireEvent.click(
      screen
        .getAllByRole("button", { name: "Highlight when available" })
        .at(-1)!,
    );
    rerender(<Console dialog />);
    const dialog = screen.getByRole("dialog");
    await show(within(dialog).getByRole("button", { name: "Confirm" }));
    expect(within(dialog).getByRole("status")).toHaveTextContent("Confirm tip");
  });

  it("keeps tips inside the active dialog and does not replay the background highlight on close", async () => {
    const { rerender } = render(<Console />);
    await show(screen.getByRole("button", { name: "Queue" }));
    rerender(<Console dialog />);
    const dialog = screen.getByRole("dialog");
    const confirm = within(dialog).getByRole("button", { name: "Confirm" });
    confirm.focus();
    await show(confirm);
    expect(within(dialog).getByRole("status")).toHaveTextContent("Confirm tip");
    expect(confirm).toHaveFocus();
    expect(screen.queryByText("Switch queues here.")).not.toBeInTheDocument();
    rerender(<Console />);
    await show(screen.getByRole("button", { name: "Queue" }));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
