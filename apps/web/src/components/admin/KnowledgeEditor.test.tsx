import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import KnowledgeEditor from "./KnowledgeEditor";

beforeEach(() => {
  Object.defineProperties(document, {
    execCommand: { configurable: true, value: vi.fn(() => true) },
    queryCommandState: { configurable: true, value: vi.fn(() => false) },
    queryCommandValue: { configurable: true, value: vi.fn(() => "p") },
  });
});

afterEach(() => vi.restoreAllMocks());

describe("KnowledgeEditor", () => {
  it("loads existing Markdown visually and retains sanitized rich text on reload", () => {
    const { rerender } = render(<KnowledgeEditor value={"# Enrollment\n\nBring **two** forms.\n\n- ID\n- Receipt"} onChange={() => {}} />);
    const editor = screen.getByRole("textbox", { name: "Knowledge document" });
    expect(editor.querySelector("h1")?.textContent).toBe("Enrollment");
    expect(editor.querySelector("strong")?.textContent).toBe("two");
    expect(editor.querySelectorAll("li")).toHaveLength(2);
    expect(screen.queryByLabelText("Preview")).toBeNull();

    rerender(<KnowledgeEditor value={'<div><h2>Steps</h2><p><u>Required</u> <b>form</b></p><script>alert(1)</script></div>'} onChange={() => {}} />);
    expect(editor.querySelector("h2")?.textContent).toBe("Steps");
    expect(editor.querySelector("u")?.textContent).toBe("Required");
    expect(editor.querySelector("script")).toBeNull();
    expect(editor.firstElementChild?.tagName).toBe("H2");
  });

  it("saves safe HTML, does not reinterpret typed Markdown, and clears empty documents", () => {
    const onChange = vi.fn();
    const { rerender } = render(<KnowledgeEditor value="" onChange={onChange} />);
    const editor = screen.getByRole("textbox");
    editor.innerHTML = '<h3>Title</h3><p><u>Bring</u> **literal**</p><img src=x onerror=alert(1)>';
    fireEvent.input(editor);
    const value = onChange.mock.lastCall![0];
    expect(value).toBe('<div><h3>Title</h3><p><u>Bring</u> **literal**</p></div>');
    rerender(<KnowledgeEditor value={value} onChange={onChange} />);
    expect(editor.textContent).toContain("**literal**");
    expect(editor.querySelector("strong")).toBeNull();
    editor.innerHTML = "<p><br></p>";
    fireEvent.input(editor);
    expect(onChange).toHaveBeenLastCalledWith("");
  });

  it("routes every toolbar action through native editing commands and restores selection", () => {
    render(<KnowledgeEditor value="Bring ID" onChange={() => {}} />);
    const editor = screen.getByRole("textbox");
    const range = document.createRange();
    range.selectNodeContents(editor);
    window.getSelection()!.removeAllRanges();
    window.getSelection()!.addRange(range);
    act(() => document.dispatchEvent(new Event("selectionchange")));
    const commands = [
      ["Bold", "bold"], ["Italic", "italic"], ["Underline", "underline"],
      ["Heading 1", "formatBlock", "h1"], ["Heading 2", "formatBlock", "h2"],
      ["Heading 3", "formatBlock", "h3"], ["Paragraph", "formatBlock", "p"],
      ["Bullet list", "insertUnorderedList"], ["Numbered list", "insertOrderedList"],
      ["Undo", "undo"], ["Redo", "redo"], ["Clear formatting", "removeFormat"], ["Remove link", "unlink"],
    ];
    for (const [label, command, value] of commands) {
      fireEvent.click(screen.getByRole("button", { name: label }));
      expect(document.execCommand).toHaveBeenLastCalledWith(command, false, value);
      expect(window.getSelection()!.toString().trim()).toBe("Bring ID");
    }
  });

  it("sanitizes pasted HTML and rejects unsafe links", () => {
    render(<KnowledgeEditor value="Bring ID" onChange={() => {}} />);
    fireEvent.paste(screen.getByRole("textbox"), {
      clipboardData: { getData: (type: string) => type === "text/html" ? '<p onclick="alert(1)"><u>ID</u><script>alert(1)</script></p>' : "ID" },
    });
    expect(document.execCommand).toHaveBeenLastCalledWith("insertHTML", false, "<p><u>ID</u></p>");
    fireEvent.click(screen.getByRole("button", { name: /^Link$/ }));
    fireEvent.change(screen.getByLabelText("Link URL"), { target: { value: "javascript:alert(1)" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply link" }));
    expect(screen.getByRole("alert").textContent).toContain("Enter a valid");
    fireEvent.change(screen.getByLabelText("Link URL"), { target: { value: "https://example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply link" }));
    expect(document.execCommand).toHaveBeenLastCalledWith("createLink", false, "https://example.com/");
  });

  it("preserves valid links through a save and reload", () => {
    const onChange = vi.fn();
    render(<KnowledgeEditor value={'<div><p><a href="https://example.com">Guide</a></p></div>'} onChange={onChange} />);
    const editor = screen.getByRole("textbox");
    expect(editor.querySelector("a")?.getAttribute("href")).toBe("https://example.com");
    expect(editor.querySelector("a")?.getAttribute("rel")).toBe("noopener noreferrer");
    fireEvent.input(editor);
    expect(onChange.mock.lastCall![0]).toContain('<a href="https://example.com"');
  });

  it("blocks editing and toolbar commands while loading", () => {
    render(<KnowledgeEditor value="" onChange={() => {}} disabled />);
    expect(screen.getByRole("textbox").getAttribute("contenteditable")).toBe("false");
    expect(screen.getByRole("button", { name: "Bold" })).toBeDisabled();
  });
});
