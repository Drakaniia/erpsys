import { useContext, type HTMLAttributes, type ReactNode } from "react";
import { MessageCtx } from "./context";

export default function MessageAvatar({
  placeholder = false,
  className = "",
  children,
  ...rest
}: {
  placeholder?: boolean;
  className?: string;
  children?: ReactNode;
} & Omit<HTMLAttributes<HTMLSpanElement>, "placeholder">) {
  const ctx = useContext(MessageCtx);
  const from = ctx?.from ?? "assistant";
  const isUser = from === "user";

  return (
    <span
      {...rest}
      className={`flex size-7 shrink-0 select-none items-center justify-center overflow-hidden rounded-full ${
        placeholder
          ? "bg-transparent"
          : isUser
            ? "bg-ink text-surface"
            : "bg-primary/10 text-primary"
      } ${className}`}
      aria-hidden="true"
    >
      {placeholder ? null : children ? (
        children
      ) : isUser ? (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="8" r="3.5" />
          <path d="M4.5 20a7.5 7.5 0 0 1 15 0" />
        </svg>
      ) : (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 3v3" />
          <path d="M12 18v3" />
          <path d="M5.6 5.6l2.1 2.1" />
          <path d="M16.3 16.3l2.1 2.1" />
          <path d="M3 12h3" />
          <path d="M18 12h3" />
          <path d="M5.6 18.4l2.1-2.1" />
          <path d="M16.3 7.7l2.1-2.1" />
        </svg>
      )}
    </span>
  );
}
