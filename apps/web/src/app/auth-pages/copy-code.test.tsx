import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CopyCodePage } from "./copy-code";

afterEach(() => {
  window.location.hash = "";
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function renderWithCode() {
  window.location.hash = "#123456";
  return render(<CopyCodePage />);
}

describe("CopyCodePage", () => {
  it("copies the emailed code with the modern clipboard API", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });

    renderWithCode();
    await user.click(screen.getByRole("button", { name: "Copy code" }));

    expect(writeText).toHaveBeenCalledWith("123456");
    expect(
      await screen.findByRole("button", { name: "Copied" }),
    ).toBeVisible();
  });

  it("uses the legacy fallback when the modern clipboard API is unavailable", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("navigator", {});
    const execCommand = vi.fn().mockReturnValue(true);
    Object.defineProperty(document, "execCommand", {
      configurable: true,
      value: execCommand,
    });

    renderWithCode();
    await user.click(screen.getByRole("button", { name: "Copy code" }));

    expect(execCommand).toHaveBeenCalledWith("copy");
    expect(document.querySelector("textarea")).not.toBeInTheDocument();
    expect(
      await screen.findByRole("button", { name: "Copied" }),
    ).toBeVisible();
  });

  it("selects the code and explains manual copying when clipboard access fails", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockRejectedValue(new Error("Clipboard blocked"));
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    Object.defineProperty(document, "execCommand", {
      configurable: true,
      value: vi.fn().mockReturnValue(false),
    });
    const select = vi.spyOn(HTMLInputElement.prototype, "select");

    renderWithCode();
    await user.click(screen.getByRole("button", { name: "Copy code" }));

    const code = screen.getByRole("textbox", { name: "Confirmation code" });
    expect(code).toHaveValue("123456");
    await waitFor(() => expect(select).toHaveBeenCalled());
    expect(screen.getByRole("status")).toHaveTextContent("The code is selected");
  });

  it("rejects a link without a six-digit code", () => {
    window.location.hash = "#invalid";
    render(<CopyCodePage />);

    expect(
      screen.getByText("This link has no code. Open the latest email from ERPSYS."),
    ).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Copy code" }),
    ).not.toBeInTheDocument();
  });
});
