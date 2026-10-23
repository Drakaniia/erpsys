export type ChatMessage = {
  /**
   * `"assistant"` matches the API's wire role. Sessions written before the
   * Cloudflare cutover are still stored with `"model"`, and `use-chat.ts`
   * treats anything that is not `"user"` as a bot bubble, so old local
   * history keeps working.
   */
  role: "user" | "assistant";
  text: string;
  timestamp: number;
};

export type ChatSession = {
  messages: ChatMessage[];
  createdAt: number;
  model?: string;
};

type SSEStartEvent = { type: "start"; model: string };
type SSETokenEvent = { type: "token"; content: string };
type SSEDoneEvent = { type: "done" };
type SSEErrorEvent = { type: "error"; message: string };

export type SSEEvent =
  | SSEStartEvent
  | SSETokenEvent
  | SSEDoneEvent
  | SSEErrorEvent;
