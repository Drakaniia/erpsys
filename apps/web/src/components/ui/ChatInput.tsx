import { createContext, useMemo, type ReactNode } from "react";

export interface ChatInputContext {
  value: string;
  onchange: (value: string) => void;
  onsubmit?: () => void;
  loading: boolean;
  onstop?: () => void;
  variant: "default" | "unstyled";
  rows: number;
}

/** Replaces Svelte's `setContext("chat-input", …)`. */
export const ChatInputCtx = createContext<ChatInputContext | undefined>(
  undefined,
);

export default function ChatInput({
  value,
  onchange,
  onsubmit,
  loading = false,
  onstop,
  variant = "default",
  rows = 1,
  className = "",
  children,
}: {
  value: string;
  onchange?: (value: string) => void;
  onsubmit?: () => void;
  loading?: boolean;
  onstop?: () => void;
  variant?: "default" | "unstyled";
  rows?: number;
  className?: string;
  children?: ReactNode;
}) {
  const ctx = useMemo<ChatInputContext>(
    () => ({
      value,
      onchange: onchange ?? (() => {}),
      onsubmit,
      loading,
      onstop,
      variant,
      rows,
    }),
    [value, onchange, onsubmit, loading, onstop, variant, rows],
  );

  return (
    <ChatInputCtx.Provider value={ctx}>
      <div
        className={`${
          variant === "default"
            ? "flex flex-col items-end w-full p-2 rounded-2xl border border-border bg-transparent focus-within:ring-1 focus-within:ring-primary focus-within:outline-none"
            : "flex items-start gap-2 w-full"
        } ${className}`}
      >
        {children}
      </div>
    </ChatInputCtx.Provider>
  );
}
