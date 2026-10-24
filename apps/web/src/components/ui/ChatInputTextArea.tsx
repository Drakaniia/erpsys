import { useContext, useEffect, useRef, type CSSProperties } from "react";
import { ChatInputCtx } from "./ChatInput";

export default function ChatInputTextArea({
  placeholder = "Type a message...",
  value: valueProp,
  onchange: onchangeProp,
  onsubmit: onsubmitProp,
  variant: variantProp,
  className = "",
  style,
}: {
  placeholder?: string;
  value?: string;
  onchange?: (value: string) => void;
  onsubmit?: () => void;
  variant?: "default" | "unstyled";
  className?: string;
  style?: string | CSSProperties;
}) {
  const ctx = useContext(ChatInputCtx);
  const value = valueProp ?? ctx?.value ?? "";
  const onchange = onchangeProp ?? ctx?.onchange;
  const onsubmit = onsubmitProp ?? ctx?.onsubmit;
  const rows = ctx?.rows ?? 1;
  const variant =
    variantProp ?? (ctx?.variant === "default" ? "unstyled" : "default");

  const textareaEl = useRef<HTMLTextAreaElement | null>(null);

  // Auto-resize: same measure-then-grow as the Svelte version.
  useEffect(() => {
    const el = textareaEl.current;
    if (!el) return;
    const computedStyle = window.getComputedStyle(el);
    const lineHeight = parseInt(computedStyle.lineHeight) || 20;
    const padding =
      parseInt(computedStyle.paddingTop) +
      parseInt(computedStyle.paddingBottom);
    const minHeight = lineHeight * rows + padding;
    el.style.height = "0px";
    const scrollHeight = Math.max(el.scrollHeight, minHeight);
    el.style.height = `${scrollHeight + 2}px`;
  }, [value, rows]);

  function handleInput(e: React.ChangeEvent<HTMLTextAreaElement>) {
    onchange?.(e.target.value);
  }

  function handleKeydown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (!onsubmit) return;
    if (e.key === "Enter" && !e.shiftKey) {
      if (typeof value !== "string" || value.trim().length === 0) return;
      e.preventDefault();
      onsubmit();
    }
  }

  return (
    <textarea
      ref={textareaEl}
      placeholder={placeholder}
      value={value}
      style={style as CSSProperties}
      onChange={handleInput}
      onKeyDown={handleKeydown}
      rows={rows}
      className={`max-h-[400px] min-h-0 w-full resize-none overflow-x-hidden rounded-lg bg-surface-raised px-3 py-2 text-[15px] text-ink outline-none placeholder:text-muted/60 ${
        variant === "unstyled"
          ? "border-none focus-visible:ring-0 focus-visible:ring-offset-0 shadow-none"
          : "border border-border focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-primary/20"
      } ${className}`}
    />
  );
}
