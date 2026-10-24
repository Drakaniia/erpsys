import { useContext, type HTMLAttributes, type ReactNode } from "react";
import {
  MessageCtx,
  type MessageAlign,
  type MessageBubbleVariant,
} from "./context";
import { usePresence } from "$lib/ui/use-presence";

const VARIANT_CLASS: Record<MessageBubbleVariant, string> = {
  solid: "bg-primary text-white",
  soft: "border border-border bg-surface-raised text-ink",
  tint: "border border-primary/20 bg-primary/8 text-ink",
  outline: "border border-border bg-transparent text-ink",
  ghost: "bg-transparent text-ink",
  danger: "border border-error/30 bg-error/8 text-error",
};

export default function MessageBubble({
  variant = "soft",
  align,
  animateIn = false,
  className = "",
  children,
  ...rest
}: {
  variant?: MessageBubbleVariant;
  align?: MessageAlign;
  animateIn?: boolean;
  className?: string;
  children?: ReactNode;
} & HTMLAttributes<HTMLDivElement>) {
  const ctx = useContext(MessageCtx);
  const resolvedAlign: MessageAlign = align ?? ctx?.align ?? "start";
  const presence = usePresence(animateIn, { scale: 0.94, duration: 220 });

  return (
    <div
      {...rest}
      style={{ ...presence.style, ...rest.style }}
      className={`w-fit max-w-full rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
        resolvedAlign === "end" ? "rounded-br-md" : "rounded-bl-md"
      } ${VARIANT_CLASS[variant]} ${className}`}
    >
      {children}
    </div>
  );
}
