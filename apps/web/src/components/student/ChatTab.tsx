import { useRef, useState } from "react";
import { renderMarkdown } from "$lib/chat/markdown";
import { useChat, type ChatViewMessage } from "$lib/chat/use-chat";
import {
  Message,
  MessageGroup,
  MessageAvatar,
  MessageContent,
  MessageHeader,
  MessageFooter,
  MessageTyping,
  MessageBubble,
  MessageBubbleContent,
  MessageScroller,
  type MessageScrollerHandle,
  PromptInput,
  AgentProgress,
} from "../ui/agents";

const SUGGESTIONS = [
  "What are the requirements?",
  "How does the queue work?",
  "What do I bring to the SBO office?",
  "Done step 5, what's next?",
  "What are the deadlines?",
  "Where is the SBO office?",
] as const;

export default function ChatTab({ onback }: { onback: () => void }) {
  const {
    messages,
    input,
    setInput,
    typing,
    showTyping,
    showProgress,
    sentAt,
    send,
    retry,
    stop,
  } = useChat();

  const [following, setFollowing] = useState(true);
  const scrollerRef = useRef<MessageScrollerHandle | null>(null);
  const [revealedId, setRevealedId] = useState<string | null>(null);

  function toggleReveal(id: string) {
    setRevealedId((prev) => (prev === id ? null : id));
  }

  const lastBotMsg =
    messages.length > 0 && messages[messages.length - 1]!.role === "bot"
      ? messages[messages.length - 1]!
      : null;

  const waitingForFirstToken =
    lastBotMsg?.streaming === true && (lastBotMsg?.text ?? "") === "";

  function isAwaitingTokens(m: ChatViewMessage): boolean {
    return m.role === "bot" && m.text === "" && !m.failed;
  }

  const timeFmt = new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <div
      className="relative flex h-full min-h-0 flex-col lg:mx-auto lg:w-full lg:max-w-[720px]"
      onClick={(e) => {
        const target = e.target as HTMLElement | null;
        if (!target?.closest("[data-message-bubble]")) setRevealedId(null);
      }}
    >
      <header className="sticky top-0 z-30 border-b border-border bg-surface lg:hidden">
        <div className="flex items-center gap-3 px-4 pb-2 pt-3">
          <button
            type="button"
            onClick={onback}
            aria-label="Back to Progress"
            className="press flex items-center gap-1 rounded-lg px-1 py-1 text-primary"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="m15 18-6-6 6-6" />
            </svg>
            <span className="text-[15px] font-medium">Progress</span>
          </button>
          <p className="flex-1 text-center text-[15px] font-semibold tracking-tight text-ink">
            Enrollment Chat
          </p>
          <div className="w-[72px]" />
        </div>
      </header>

      <div className="relative min-h-0 flex-1">
        <MessageScroller
          ref={scrollerRef}
          busy={typing}
          onfollowchange={(next) => setFollowing(next)}
          viewportClassName="px-4 pt-4 pb-2"
          contentClassName="gap-3 pb-6"
        >
          {messages.length === 0 ? (
            <div className="flex flex-col items-center gap-3 px-6 pt-10 text-center">
              <img
                src="/images/ai_chat.webp"
                alt=""
                width="30"
                height="30"
                className="h-[30px] w-[30px] object-contain"
                aria-hidden="true"
              />
              <p className="text-[15px] font-medium text-ink">
                Ask about the enrollment process
              </p>
              <p className="max-w-[240px] text-sm text-muted">
                Steps, requirements, queueing — I answer from the SBO process
                guide.
              </p>
            </div>
          ) : null}

          {messages.map((m) =>
            !isAwaitingTokens(m) ? (
              <MessageGroup key={m.id} spacing="default">
                <Message from={m.role === "user" ? "user" : "assistant"}>
                  {m.role !== "user" ? <MessageAvatar /> : null}
                  <MessageContent
                    className={m.role === "user" ? "items-end" : "items-start"}
                  >
                    {m.role !== "user" ? (
                      <MessageHeader>
                        <span className="font-medium text-ink/70">
                          Enrollment Assistant
                        </span>
                        <span>{timeFmt.format(new Date(m.at))}</span>
                      </MessageHeader>
                    ) : null}

                    {m.role === "user" ? (
                      <>
                        <button
                          type="button"
                          data-message-bubble
                          onClick={() => toggleReveal(m.id)}
                          aria-expanded={revealedId === m.id}
                          className="press m-0 w-fit max-w-full cursor-pointer appearance-none border-0 bg-transparent p-0"
                        >
                          <MessageBubble variant="solid">
                            <MessageBubbleContent className="whitespace-pre-wrap">
                              {m.text}
                            </MessageBubbleContent>
                          </MessageBubble>
                        </button>
                        {revealedId === m.id ? (
                          <div>
                            <MessageFooter>
                              Sent {timeFmt.format(new Date(m.at))}
                            </MessageFooter>
                          </div>
                        ) : null}
                      </>
                    ) : m.text !== "" || m.failed ? (
                      <MessageBubble variant={m.failed ? "danger" : "soft"}>
                        {m.streaming ? (
                          <MessageBubbleContent className="whitespace-pre-wrap">
                            {m.text}
                            <span
                              className="ml-0.5 inline-block h-3.5 w-[2px] translate-y-[2px] bg-primary"
                              aria-hidden="true"
                            />
                          </MessageBubbleContent>
                        ) : (
                          <MessageBubbleContent
                            className="markdown-body"
                            render={
                              <div
                                dangerouslySetInnerHTML={{
                                  __html: renderMarkdown(m.text),
                                }}
                              />
                            }
                          />
                        )}
                      </MessageBubble>
                    ) : null}

                    {m.failed ? (
                      <MessageFooter>
                        <button
                          type="button"
                          onClick={retry}
                          className="press rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white"
                        >
                          Retry
                        </button>
                      </MessageFooter>
                    ) : m.stopped ? (
                      <MessageFooter>Stopped</MessageFooter>
                    ) : null}
                  </MessageContent>
                </Message>
              </MessageGroup>
            ) : null,
          )}

          {waitingForFirstToken && (showTyping || showProgress) ? (
            <MessageGroup spacing="default">
              <Message from="assistant">
                <MessageAvatar />
                <MessageContent>
                  <MessageBubble variant="soft">
                    {showProgress ? (
                      <AgentProgress
                        label="Still working"
                        initialSeconds={Math.floor(
                          (Date.now() - sentAt) / 1000,
                        )}
                      />
                    ) : (
                      <MessageTyping label="Assistant is replying" />
                    )}
                  </MessageBubble>
                </MessageContent>
              </Message>
            </MessageGroup>
          ) : null}
        </MessageScroller>

        {!following ? (
          <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center">
            <button
              type="button"
              onClick={() => scrollerRef.current?.scrollToEnd()}
              className="press pointer-events-auto flex items-center gap-1.5 rounded-full border border-border bg-chrome-strong px-3 py-1.5 text-xs font-medium text-ink shadow-sm backdrop-blur"
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M12 5v14" />
                <path d="m19 12-7 7-7-7" />
              </svg>
              Jump to latest
            </button>
          </div>
        ) : null}
      </div>

      <p className="sr-only" role="status" aria-live="polite">
        {lastBotMsg &&
        !lastBotMsg.streaming &&
        !lastBotMsg.failed &&
        lastBotMsg.text
          ? "Reply ready"
          : null}
      </p>

      <div
        className="flex gap-2 overflow-x-auto bg-surface px-4 pb-2 [scrollbar-width:none]"
        aria-label="Suggested questions"
      >
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => void send(s)}
            disabled={typing}
            className="press shrink-0 whitespace-nowrap rounded-full border border-border bg-surface-raised px-3 py-1.5 text-xs font-medium text-primary hover:border-primary/40 disabled:opacity-50"
          >
            {s}
          </button>
        ))}
      </div>

      <div className="sticky bottom-0 z-30 bg-surface px-4 py-3">
        <PromptInput
          value={input}
          onchange={setInput}
          placeholder="Ask a question…"
          loading={typing}
          onsubmit={(text) => void send(text)}
          onstop={stop}
          minRows={1}
        />
      </div>
    </div>
  );
}
