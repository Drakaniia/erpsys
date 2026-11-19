import { useEffect, useRef, useState } from "react";
import { renderMarkdown, sanitizeHtml } from "$lib/chat/markdown";

const tools = [
  { label: "Bold", text: "B", command: "bold", style: "font-bold" },
  { label: "Italic", text: "I", command: "italic", style: "italic" },
  { label: "Underline", text: "U", command: "underline", style: "underline" },
  { label: "Heading 1", text: "H1", command: "formatBlock", value: "h1" },
  { label: "Heading 2", text: "H2", command: "formatBlock", value: "h2" },
  { label: "Heading 3", text: "H3", command: "formatBlock", value: "h3" },
  { label: "Paragraph", text: "¶", command: "formatBlock", value: "p" },
  { label: "Bullet list", text: "• List", command: "insertUnorderedList" },
  { label: "Numbered list", text: "1. List", command: "insertOrderedList" },
  { label: "Undo", text: "Undo", command: "undo" },
  { label: "Redo", text: "Redo", command: "redo" },
  { label: "Clear formatting", text: "Clear", command: "removeFormat" },
];

export default function KnowledgeEditor({
  value,
  onChange,
  disabled = false,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const editor = useRef<HTMLDivElement>(null);
  const selection = useRef<Range | null>(null);
  const lastValue = useRef<string | null>(null);
  const [active, setActive] = useState<string[]>([]);
  const [linkOpen, setLinkOpen] = useState(false);
  const [link, setLink] = useState("");
  const [linkError, setLinkError] = useState("");

  useEffect(() => {
    if (!editor.current || lastValue.current === value) return;
    editor.current.innerHTML =
      value.startsWith("<div>") && value.endsWith("</div>")
        ? sanitizeHtml(value.slice(5, -6))
        : renderMarkdown(value);
    lastValue.current = value;
    selection.current = null;
  }, [value]);

  useEffect(() => {
    const track = () => {
      const current = window.getSelection();
      if (
        !current?.rangeCount ||
        !editor.current?.contains(current.anchorNode) ||
        !editor.current.contains(current.focusNode)
      )
        return;
      selection.current = current.getRangeAt(0).cloneRange();
      setActive(
        tools
          .filter((tool) =>
            tool.command === "formatBlock"
              ? String(
                  document.queryCommandValue("formatBlock"),
                ).toLowerCase() === tool.value
              : document.queryCommandState(tool.command),
          )
          .map((tool) => tool.label),
      );
    };
    document.addEventListener("selectionchange", track);
    return () => document.removeEventListener("selectionchange", track);
  }, []);

  function changed() {
    if (!editor.current) return;
    const html = sanitizeHtml(editor.current.innerHTML);
    const value = editor.current.textContent?.trim()
      ? `<div>${html}</div>`
      : "";
    lastValue.current = value;
    onChange(value);
  }

  function command(name: string, value?: string) {
    if (disabled || !editor.current) return;
    editor.current.focus();
    const current = window.getSelection();
    if (
      current &&
      selection.current &&
      editor.current.contains(selection.current.commonAncestorContainer)
    ) {
      current.removeAllRanges();
      current.addRange(selection.current);
    }
    // Native commands preserve the browser's selection and undo history.
    document.execCommand("styleWithCSS", false, "false");
    document.execCommand(name, false, value);
    changed();
    document.dispatchEvent(new Event("selectionchange"));
  }

  function addLink() {
    try {
      const url = new URL(link);
      if (!["https:", "http:", "mailto:"].includes(url.protocol))
        throw new Error();
      command("createLink", url.href);
      setLinkOpen(false);
      setLink("");
      setLinkError("");
    } catch {
      setLinkError("Enter a valid https://, http://, or mailto: link.");
    }
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface-raised">
      <div
        role="group"
        aria-label="Text formatting"
        className="flex flex-wrap gap-1 border-b border-border p-2"
      >
        {tools.map((tool) => (
          <button
            key={tool.label}
            type="button"
            aria-label={tool.label}
            title={tool.label}
            aria-pressed={
              ["undo", "redo", "removeFormat"].includes(tool.command)
                ? undefined
                : active.includes(tool.label)
            }
            disabled={disabled}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => command(tool.command, tool.value)}
            className={`min-h-9 min-w-9 rounded-md px-2 text-sm text-ink hover:bg-primary/10 focus-visible:outline-2 focus-visible:outline-primary aria-pressed:bg-primary/10 aria-pressed:text-primary disabled:opacity-40 ${tool.style ?? ""}`}
          >
            {tool.text}
          </button>
        ))}
        <button
          type="button"
          disabled={disabled}
          aria-expanded={linkOpen}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => setLinkOpen(!linkOpen)}
          className="min-h-9 rounded-md px-2 text-sm text-ink hover:bg-primary/10 focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-40"
        >
          Link
        </button>
        <button
          type="button"
          disabled={disabled}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => command("unlink")}
          className="min-h-9 rounded-md px-2 text-sm text-ink hover:bg-primary/10 focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-40"
        >
          Remove link
        </button>
      </div>
      {linkOpen && (
        <div className="flex flex-wrap items-center gap-2 border-b border-border p-2">
          <label className="text-sm text-ink" htmlFor="knowledge-link">
            Link URL
          </label>
          <input
            id="knowledge-link"
            type="url"
            autoFocus
            value={link}
            onChange={(event) => setLink(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                addLink();
              }
              if (event.key === "Escape") {
                setLinkOpen(false);
                editor.current?.focus();
              }
            }}
            aria-invalid={Boolean(linkError)}
            aria-describedby={linkError ? "knowledge-link-error" : undefined}
            className="min-w-0 flex-1 rounded-md border border-border bg-surface-raised px-2 py-1.5 text-sm text-ink"
          />
          <button
            type="button"
            onClick={addLink}
            className="rounded-md bg-primary px-3 py-1.5 text-sm text-white"
          >
            Apply link
          </button>
          <button
            type="button"
            onClick={() => {
              setLinkOpen(false);
              editor.current?.focus();
            }}
            className="px-2 py-1.5 text-sm text-muted"
          >
            Cancel
          </button>
          {linkError && (
            <p
              id="knowledge-link-error"
              role="alert"
              className="w-full text-sm text-error"
            >
              {linkError}
            </p>
          )}
        </div>
      )}
      <div
        ref={editor}
        role="textbox"
        aria-label="Knowledge document"
        aria-multiline="true"
        aria-readonly={disabled}
        contentEditable={!disabled}
        suppressContentEditableWarning
        onInput={changed}
        onPaste={(event) => {
          event.preventDefault();
          const html = event.clipboardData.getData("text/html");
          command(
            html ? "insertHTML" : "insertText",
            html
              ? sanitizeHtml(html)
              : event.clipboardData.getData("text/plain"),
          );
        }}
        onDrop={(event) => event.preventDefault()}
        className="h-[480px] overflow-y-auto p-4 text-sm leading-relaxed text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary [&_h1]:my-4 [&_h1]:text-3xl [&_h1]:font-bold [&_h2]:my-3 [&_h2]:text-2xl [&_h2]:font-bold [&_h3]:my-2 [&_h3]:text-xl [&_h3]:font-semibold [&_p]:my-2 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6 [&_li]:my-1 [&_a]:text-primary [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-4 [&_pre]:whitespace-pre-wrap [&_strong]:font-bold [&_b]:font-bold [&_em]:italic [&_i]:italic [&_u]:underline"
      />
    </div>
  );
}
