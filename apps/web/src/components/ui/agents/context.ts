import { createContext } from "react";

export type MessageFrom = "user" | "assistant";

export type MessageAlign = "start" | "end";

export type MessageBubbleVariant =
  | "solid"
  | "soft"
  | "tint"
  | "outline"
  | "ghost"
  | "danger";

export type MessageContext = {
  from: MessageFrom;
  align: MessageAlign;
};

/** Replaces Svelte's `setContext(MESSAGE_CTX, …)`. */
export const MessageCtx = createContext<MessageContext | undefined>(undefined);
