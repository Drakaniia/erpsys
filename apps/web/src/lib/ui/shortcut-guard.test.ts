import { afterEach, describe, expect, it } from "vitest";
import { shortcutBlocked } from "./shortcut-guard";

function keyOn(target: HTMLElement, init: KeyboardEventInit = {}) {
  let blocked: boolean | null = null;
  target.addEventListener("keydown", (e) => (blocked = shortcutBlocked(e)), {
    once: true,
  });
  target.dispatchEvent(new KeyboardEvent("keydown", { key: "1", ...init }));
  return blocked;
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("shortcutBlocked", () => {
  it("lets a plain key on the page through", () => {
    expect(keyOn(document.body)).toBe(false);
  });

  it("blocks typing and picking in form controls", () => {
    for (const tag of ["input", "textarea", "select"]) {
      const el = document.createElement(tag);
      document.body.append(el);
      expect(keyOn(el)).toBe(true);
    }
  });

  it("blocks modified keys so browser shortcuts keep working", () => {
    expect(keyOn(document.body, { ctrlKey: true })).toBe(true);
  });

  it("blocks while any modal dialog is open", () => {
    const dialog = document.createElement("div");
    dialog.setAttribute("aria-modal", "true");
    document.body.append(dialog);
    expect(keyOn(document.body)).toBe(true);
  });
});
