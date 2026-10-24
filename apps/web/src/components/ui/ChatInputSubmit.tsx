import { useContext } from "react";
import { ChatInputCtx } from "./ChatInput";

export default function ChatInputSubmit({
  onSubmit: onSubmitProp,
  loading: loadingProp,
  onStop: onStopProp,
  className = "",
}: {
  onSubmit?: () => void;
  loading?: boolean;
  onStop?: () => void;
  className?: string;
}) {
  const ctx = useContext(ChatInputCtx);
  const loading = loadingProp ?? ctx?.loading ?? false;
  const onStop = onStopProp ?? ctx?.onstop;
  const onSubmit = onSubmitProp ?? ctx?.onsubmit;
  const value = ctx?.value ?? "";
  const isDisabled = typeof value !== "string" || value.trim().length === 0;

  function handleClick(e: React.MouseEvent) {
    e.preventDefault();
    if (loading && onStop) {
      onStop();
    } else if (!isDisabled) {
      onSubmit?.();
    }
  }

  if (loading && onStop) {
    return (
      <button
        type="button"
        onClick={handleClick}
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border bg-surface-raised text-ink transition-colors hover:bg-border ${className}`}
        aria-label="Stop"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="currentColor"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <title>Stop</title>
          <rect x="6" y="6" width="12" height="12" />
        </svg>
      </button>
    );
  }

  return (
    <button
      type="submit"
      disabled={isDisabled}
      onClick={handleClick}
      className={`flex h-8 w-8 shrink-0 items-center justify-center transition-opacity disabled:opacity-30 enabled:hover:opacity-90 enabled:active:scale-95 ${className}`}
      aria-label="Send"
    >
      <img
        src="/images/send.webp"
        alt=""
        width="32"
        height="32"
        className="h-8 w-8 object-contain"
        aria-hidden="true"
        draggable="false"
      />
    </button>
  );
}
