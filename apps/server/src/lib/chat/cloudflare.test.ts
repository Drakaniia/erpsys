import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildChatRequestBody,
  cloudflareChatUrl,
  createChatStreamParser,
  parseChatLine,
  parseCloudflareErrorCode,
  readChatDeltaContent,
  type ChatDelta,
} from "./cloudflare.js";

function fixture<T>(name: string): T {
  return JSON.parse(
    readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8"),
  ) as T;
}

type StreamFixture = { frames: string[] };

describe("cloudflareChatUrl", () => {
  it("builds the OpenAI-compatible endpoint for the account", () => {
    expect(cloudflareChatUrl("acct-123")).toBe(
      "https://api.cloudflare.com/client/v4/accounts/acct-123/ai/v1/chat/completions",
    );
  });
});

describe("buildChatRequestBody", () => {
  const body = buildChatRequestBody({
    model: "@cf/openai/gpt-oss-20b",
    systemPrompt: "SYSTEM PROMPT",
    messages: [
      { role: "user", text: "hi" },
      { role: "assistant", text: "hello" },
    ],
  });

  it("puts the system prompt first and keeps the conversation order", () => {
    expect(body.messages).toEqual([
      { role: "system", content: "SYSTEM PROMPT" },
      { role: "user", content: "hi" },
      { role: "assistant", content: "hello" },
    ]);
  });

  it("streams with an explicit max_tokens and fail-fast when busy", () => {
    expect(body).toMatchObject({
      model: "@cf/openai/gpt-oss-20b",
      stream: true,
      temperature: 0.2,
      max_tokens: 800,
      rejectIfBusy: true,
    });
  });

  it("never sends the native /ai/run shape or stream_options", () => {
    const keys = Object.keys(body);
    expect(keys).not.toContain("stream_options");
    expect(keys).not.toContain("prompt");
    expect(keys).not.toContain("contents");
    expect(keys).not.toContain("generationConfig");
  });
});

describe("the SSE delta parser", () => {
  const stream = fixture<StreamFixture>("chat-stream.json");

  function collect(frames: string[], chunkSize = 1_000_000): ChatDelta[] {
    const parser = createChatStreamParser();
    const deltas: ChatDelta[] = [];
    const text = frames.join("\n");
    for (let i = 0; i < text.length; i += chunkSize) {
      deltas.push(...parser.push(text.slice(i, i + chunkSize)));
    }
    deltas.push(...parser.flush());
    return deltas;
  }

  it("emits only the assistant's text from a recorded stream", () => {
    const deltas = collect(stream.frames);
    expect(deltas.filter((d) => d.kind === "content")).toEqual([
      { kind: "content", text: "Bring your " },
      { kind: "content", text: "Form 137 and a 2x2 photo." },
    ]);
  });

  it("is insensitive to where the network splits the frames", () => {
    // One byte at a time is the worst case: every frame straddles a read.
    const byByte = collect(stream.frames, 1);
    expect(byByte.filter((d) => d.kind === "content")).toEqual([
      { kind: "content", text: "Bring your " },
      { kind: "content", text: "Form 137 and a 2x2 photo." },
    ]);
    expect(byByte.filter((d) => d.kind === "done")).toHaveLength(1);
  });

  it("reports [DONE] as a done delta", () => {
    expect(parseChatLine("data: [DONE]")).toEqual({ kind: "done" });
  });

  it("surfaces usage but never as content", () => {
    const usage = collect(stream.frames).filter((d) => d.kind === "usage");
    expect(usage).toHaveLength(1);
  });

  it("skips malformed JSON instead of failing the stream", () => {
    expect(parseChatLine("data: {not json")).toBeNull();
    expect(parseChatLine("keep-alive")).toBeNull();
    expect(parseChatLine("data:")).toBeNull();
    expect(
      collect([
        "data: {oops",
        'data: {"choices":[{"delta":{"content":"ok"}}]}',
      ]),
    ).toEqual([{ kind: "content", text: "ok" }]);
  });

  it("never lets reasoning text reach the client", () => {
    const reasoning = fixture<StreamFixture>("reasoning-only.json");
    const deltas = collect(reasoning.frames);
    expect(deltas.filter((d) => d.kind === "content")).toEqual([]);
    // Belt and braces: no delta of any kind may carry the reasoning strings.
    const serialized = JSON.stringify(deltas);
    expect(serialized).not.toContain("think about the step order");
    expect(serialized).not.toContain("queue rules");
    expect(serialized).not.toContain("shortest answer");
    expect(serialized).not.toContain("message-level reasoning");
    expect(serialized).not.toContain("both at once");
  });

  it("returns no content for an empty delta", () => {
    expect(readChatDeltaContent({ choices: [{ delta: {} }] })).toBeNull();
    expect(readChatDeltaContent({ choices: [] })).toBeNull();
    expect(readChatDeltaContent(null)).toBeNull();
  });
});

describe("parseCloudflareErrorCode", () => {
  it("reads the Cloudflare-native envelope (3036 account limited)", () => {
    const body = fixture<{ body: string }>("error-3036-account-limited.json");
    expect(parseCloudflareErrorCode(body.body)).toBe(3036);
  });

  it("reads the OpenAI envelope (3040 out of capacity)", () => {
    const body = fixture<{ body: string }>("error-3040-out-of-capacity.json");
    expect(parseCloudflareErrorCode(body.body)).toBe(3040);
  });

  it("reads both envelopes from the remaining fixtures", () => {
    const other = fixture<Record<string, { body: string }>>("error-other.json");
    expect(parseCloudflareErrorCode(other.needsPaid.body)).toBe(5035);
    expect(parseCloudflareErrorCode(other.accountBlocked.body)).toBe(3023);
    expect(parseCloudflareErrorCode(other.tooLarge.body)).toBe(3006);
    expect(parseCloudflareErrorCode(other.badModelId.body)).toBe(3042);
  });

  it("falls back to a substring scan for a non-JSON body", () => {
    expect(parseCloudflareErrorCode("upstream said 3036 today")).toBe(3036);
    expect(parseCloudflareErrorCode('{"error":"3040 Out of capacity"}')).toBe(
      3040,
    );
  });

  it("returns null when there is no code to find", () => {
    expect(parseCloudflareErrorCode("")).toBeNull();
    expect(parseCloudflareErrorCode("{}")).toBeNull();
    expect(parseCloudflareErrorCode("<html>500</html>")).toBeNull();
    const other = fixture<Record<string, { body: string }>>("error-other.json");
    expect(parseCloudflareErrorCode(other.unparseable429.body)).toBeNull();
  });
});
