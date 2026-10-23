import { describe, expect, it } from "vitest";
import {
  buildApiMessages,
  formatFriendlyError,
  formatValidationMessage,
  type ChatViewMessage,
} from "./stream-helpers";

const user = (text: string): ChatViewMessage => ({ role: "user", text });
const bot = (text: string): ChatViewMessage => ({ role: "bot", text });

describe("buildApiMessages", () => {
  it("maps user/bot to the API's user/assistant roles", () => {
    expect(buildApiMessages([user("hi"), bot("hello")])).toEqual([
      { role: "user", text: "hi" },
      { role: "assistant", text: "hello" },
    ]);
  });

  it("drops the streaming placeholder bubble", () => {
    const messages = [
      user("q"),
      { role: "bot", text: "", streaming: true } as ChatViewMessage,
    ];
    expect(buildApiMessages(messages)).toEqual([{ role: "user", text: "q" }]);
  });

  it("drops failed bubbles, whose text is error copy rather than an answer", () => {
    const messages = [
      user("q"),
      { ...bot("Can't reach the assistant"), failed: true },
    ];
    expect(buildApiMessages(messages)).toEqual([{ role: "user", text: "q" }]);
  });

  it("keeps a stopped partial answer in the assistant's context", () => {
    const messages = [
      user("q"),
      { ...bot("The requirements are"), stopped: true },
    ];
    expect(buildApiMessages(messages)).toEqual([
      { role: "user", text: "q" },
      { role: "assistant", text: "The requirements are" },
    ]);
  });

  it("drops blank bubbles so the request is never empty", () => {
    expect(buildApiMessages([{ ...bot("   ") }])).toEqual([]);
  });
});

describe("formatFriendlyError", () => {
  it("maps rate limiting to a retry-later message", () => {
    expect(formatFriendlyError(429, "")).toContain("try again in a minute");
  });

  it("does not leak a server body for auth failures", () => {
    expect(formatFriendlyError(401, '{"error":"token abc123"}')).toBe(
      "You need to be signed in to use the chatbot.",
    );
    expect(formatFriendlyError(403, "Forbidden")).toBe(
      "You need to be signed in to use the chatbot.",
    );
  });

  it("does not leak internals for 400 or 5xx", () => {
    expect(formatFriendlyError(400, "stack trace here")).not.toContain(
      "stack trace",
    );
    expect(formatFriendlyError(500, "ECONNREFUSED db:5432")).not.toContain(
      "5432",
    );
  });

  it("falls back to a generic message for unknown statuses", () => {
    expect(formatFriendlyError(418, "")).toBe(
      "Something went wrong — please try again.",
    );
  });
});

describe("formatValidationMessage", () => {
  it("returns a fallback when there are no issues", () => {
    expect(formatValidationMessage([])).toContain("messages array is required");
  });

  it("names the offending index and field", () => {
    const message = formatValidationMessage([
      { path: ["messages", 2, "text"], code: "too_big" },
    ]);
    expect(message).toContain("messages[2].text");
    expect(message).toContain("2000 characters");
  });

  it("caps the message length", () => {
    const issues = Array.from({ length: 5 }, (_, i) => ({
      path: ["messages", i, "text"],
      code: "too_big",
    }));
    expect(formatValidationMessage(issues).length).toBeLessThanOrEqual(240);
  });
});
