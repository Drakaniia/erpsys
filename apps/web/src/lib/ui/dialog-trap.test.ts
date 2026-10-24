import { describe, expect, it, vi } from "vitest";
import { dialogTrap } from "./dialog-trap";

function mount(html: string, options?: Parameters<typeof dialogTrap>[1]) {
  const opener = document.createElement("button");
  opener.textContent = "open";
  document.body.append(opener);
  opener.focus();

  const panel = document.createElement("div");
  panel.tabIndex = -1;
  panel.innerHTML = html;
  document.body.append(panel);

  const handle = dialogTrap(panel, options);
  return { panel, opener, destroy: () => handle.destroy?.() };
}

describe("dialogTrap", () => {
  it("focuses the first focusable", () => {
    const { panel } = mount(
      "<button id='a'>a</button><button id='b'>b</button>",
    );
    expect(document.activeElement?.id).toBe("a");
    expect(panel.contains(document.activeElement)).toBe(true);
  });

  it("prefers the marked element", () => {
    mount(
      "<button id='a'>a</button><button id='marked' data-modal-initial-focus>m</button>",
    );
    expect(document.activeElement?.id).toBe("marked");
  });

  it("skips a disabled marked element", () => {
    mount(
      "<button id='marked' data-modal-initial-focus disabled>m</button><button id='b'>b</button>",
    );
    expect(document.activeElement?.id).toBe("b");
  });

  it("focuses the panel itself when asked", () => {
    const { panel } = mount("<button id='a'>a</button>", {
      initialFocus: "panel",
    });
    expect(document.activeElement).toBe(panel);
  });

  it("falls back to the panel when there is nothing focusable", () => {
    const { panel } = mount("<p>read only</p>");
    expect(document.activeElement).toBe(panel);
  });

  it("closes on Escape", () => {
    const onEscape = vi.fn();
    mount("<button>a</button>", { onEscape });
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", cancelable: true }),
    );
    expect(onEscape).toHaveBeenCalledOnce();
  });

  it("wraps Tab from last back to first", () => {
    mount("<button id='a'>a</button><button id='b'>b</button>");
    document.getElementById("b")?.focus();
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Tab", cancelable: true }),
    );
    expect(document.activeElement?.id).toBe("a");
  });

  it("wraps Shift+Tab from first back to last", () => {
    mount("<button id='a'>a</button><button id='b'>b</button>");
    document.getElementById("a")?.focus();
    document.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Tab",
        shiftKey: true,
        cancelable: true,
      }),
    );
    expect(document.activeElement?.id).toBe("b");
  });

  it("pulls focus back in when it has escaped the panel", () => {
    const { opener } = mount(
      "<button id='a'>a</button><button id='b'>b</button>",
    );
    opener.focus();
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Tab", cancelable: true }),
    );
    expect(document.activeElement?.id).toBe("a");
  });

  it("restores focus to the opener and stops listening on destroy", () => {
    const onEscape = vi.fn();
    const { opener, destroy } = mount("<button>a</button>", { onEscape });
    destroy();
    expect(document.activeElement).toBe(opener);
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", cancelable: true }),
    );
    expect(onEscape).not.toHaveBeenCalled();
  });

  it("hands other keys to onKey and skips the trap when it claims one", () => {
    const onKey = vi.fn((event: KeyboardEvent) => event.key === "ArrowRight");
    mount("<button id='a'>a</button><button id='b'>b</button>", { onKey });
    document.getElementById("b")?.focus();

    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowRight", cancelable: true }),
    );
    expect(onKey).toHaveBeenCalledOnce();
    expect(document.activeElement?.id).toBe("b");

    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Tab", cancelable: true }),
    );
    expect(document.activeElement?.id).toBe("a");
  });
});
