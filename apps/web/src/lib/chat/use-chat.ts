import { useEffect, useRef, useState } from "react";
import { authClient } from "$lib/auth-client";
import { loadSession, appendMessage, newSession } from "$lib/chat/history";
import type { ChatSession, SSEEvent } from "$lib/chat/types";
import {
  buildApiMessages,
  formatFriendlyError,
} from "$lib/chat/stream-helpers";

const TYPING_DELAY_MS = 400;
const PROGRESS_DELAY_MS = 8000;
const CONNECTION_ERROR =
  "Can't reach the assistant — check your connection and tap Retry.";

export type ChatViewMessage = {
  id: string;
  role: "user" | "bot";
  text: string;
  at: number;
  failed?: boolean;
  streaming?: boolean;
  stopped?: boolean;
  model?: string;
};

function friendlyError(message: string): Error {
  const e = new Error(message);
  e.name = "FriendlyChatError";
  return e;
}

// ponytail: one hook, not a message-store abstraction — useState + patch-by-index
// covers token appends, retry reset, and abort. Extract further only if a second
// surface streams the same SSE shape.
export function useChat() {
  const sessionQuery = authClient.useSession();
  const userId = (sessionQuery.data?.user as { id?: string } | undefined)?.id;

  const seq = useRef(0);
  function nextId(): string {
    seq.current += 1;
    return `m${seq.current}`;
  }

  const [messages, setMessages] = useState<ChatViewMessage[]>([]);
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);
  const [lastFailedQuestion, setLastFailedQuestion] = useState<string | null>(
    null,
  );
  const [session, setSession] = useState<ChatSession | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const [showTyping, setShowTyping] = useState(false);
  const [showProgress, setShowProgress] = useState(false);
  const [sentAt, setSentAt] = useState(Date.now());
  const timers = useRef<{
    typing: ReturnType<typeof setTimeout> | null;
    progress: ReturnType<typeof setTimeout> | null;
  }>({ typing: null, progress: null });

  function endLoadingIndicators() {
    if (timers.current.typing) clearTimeout(timers.current.typing);
    if (timers.current.progress) clearTimeout(timers.current.progress);
    timers.current.typing = null;
    timers.current.progress = null;
    setShowTyping(false);
    setShowProgress(false);
  }

  function beginLoadingIndicators() {
    endLoadingIndicators();
    timers.current.typing = setTimeout(
      () => setShowTyping(true),
      TYPING_DELAY_MS,
    );
    timers.current.progress = setTimeout(() => {
      setShowTyping(false);
      setShowProgress(true);
    }, PROGRESS_DELAY_MS);
  }

  useEffect(() => () => endLoadingIndicators(), []);

  useEffect(() => {
    if (!userId) return;
    const existing = loadSession(userId);
    if (existing) {
      setSession(existing);
      setMessages(
        existing.messages.map((m) => ({
          id: nextId(),
          // Tolerant on purpose: a session saved before the role rename still
          // has `"model"`, which is the bot, not the user.
          role: m.role === "user" ? ("user" as const) : ("bot" as const),
          text: m.text,
          at: m.timestamp,
        })),
      );
    } else {
      setSession(newSession());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  function persistMessage(role: "user" | "assistant", text: string) {
    if (!userId || !session) return;
    setSession(appendMessage(userId, { role, text, timestamp: Date.now() }));
  }

  function patchBot(
    botIndex: number,
    patch: (m: ChatViewMessage) => ChatViewMessage,
  ) {
    setMessages((prev) => prev.map((m, i) => (i === botIndex ? patch(m) : m)));
  }

  async function send(raw: string, isRetry = false) {
    const question = raw.trim();
    if (!question || typing) return;

    let snapshot: ChatViewMessage[];
    if (!isRetry) {
      const userMsg: ChatViewMessage = {
        id: nextId(),
        role: "user",
        text: question,
        at: Date.now(),
      };
      snapshot = [...messages, userMsg];
      setMessages([
        ...snapshot,
        {
          id: nextId(),
          role: "bot",
          text: "",
          at: Date.now(),
          streaming: true,
        },
      ]);
      persistMessage("user", question);
    } else {
      const last = messages[messages.length - 1];
      if (last?.role !== "bot") return;
      const botIndex = messages.length - 1;
      patchBot(botIndex, (m) => ({
        ...m,
        text: "",
        failed: false,
        stopped: false,
        streaming: true,
      }));
      snapshot = messages;
    }
    const botIndex = isRetry ? snapshot.length - 1 : snapshot.length;
    setInput("");
    setTyping(true);
    setLastFailedQuestion(null);
    setSentAt(Date.now());
    beginLoadingIndicators();

    const apiMessages = buildApiMessages(
      isRetry
        ? snapshot.map((m, i) =>
            i === botIndex
              ? { ...m, text: "", failed: false, streaming: true }
              : m,
          )
        : [
            ...snapshot,
            {
              id: "tmp",
              role: "bot" as const,
              text: "",
              at: 0,
              streaming: true,
            },
          ],
    );

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const response = await fetch("/api/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: apiMessages }),
        signal: controller.signal,
      });

      if (!response.ok) {
        let serverMessage: string | null = null;
        try {
          const body = (await response.json()) as { error?: unknown };
          if (typeof body?.error === "string" && body.error.length > 0) {
            serverMessage = body.error;
          }
        } catch {
          /* non-JSON error body */
        }
        const isAuthError = response.status === 401 || response.status === 403;
        const message =
          serverMessage && !isAuthError
            ? serverMessage
            : formatFriendlyError(response.status, "");
        throw friendlyError(message);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let buffer = "";
      let finalText = "";

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data: ")) continue;

          try {
            const event: SSEEvent = JSON.parse(trimmed.slice(6));

            if (event.type === "start") {
              patchBot(botIndex, (m) => ({ ...m, model: event.model }));
            } else if (event.type === "token") {
              endLoadingIndicators();
              finalText += event.content;
              const text = finalText;
              patchBot(botIndex, (m) => ({ ...m, text, failed: false }));
              setLastFailedQuestion(null);
            } else if (event.type === "error") {
              endLoadingIndicators();
              if (finalText) {
                patchBot(botIndex, (m) => ({
                  ...m,
                  text: `${finalText}\n\n${event.message}`,
                  streaming: false,
                }));
              } else {
                patchBot(botIndex, (m) => ({
                  ...m,
                  text: event.message,
                  failed: true,
                }));
                setLastFailedQuestion(question);
              }
            } else if (event.type === "done") {
              endLoadingIndicators();
              patchBot(botIndex, (m) => ({ ...m, streaming: false }));
              if (finalText) persistMessage("assistant", finalText);
            }
          } catch {
            // Skip malformed lines
          }
        }
      }
    } catch (err) {
      endLoadingIndicators();
      if (err instanceof DOMException && err.name === "AbortError") {
        patchBot(botIndex, (m) => {
          const next = { ...m, streaming: false, stopped: true };
          if (next.text.trim().length > 0)
            persistMessage("assistant", next.text);
          return next;
        });
        return;
      }
      patchBot(botIndex, (m) => ({
        ...m,
        text:
          err instanceof Error && err.name === "FriendlyChatError"
            ? err.message
            : CONNECTION_ERROR,
        failed: true,
        streaming: false,
      }));
      setLastFailedQuestion(question);
    } finally {
      setTyping(false);
      abortRef.current = null;
      endLoadingIndicators();
    }
  }

  function retry() {
    if (lastFailedQuestion) void send(lastFailedQuestion, true);
  }

  function stop() {
    abortRef.current?.abort();
  }

  return {
    messages,
    input,
    setInput,
    typing,
    lastFailedQuestion,
    showTyping,
    showProgress,
    sentAt,
    send,
    retry,
    stop,
  };
}
