export const CF_ERROR_ACCOUNT_LIMITED = 3036;
export const CF_ERROR_OUT_OF_CAPACITY = 3040;
export const CF_ERROR_REQUEST_TOO_LARGE = 3006;
export const CF_ERROR_BAD_MODEL_ID = 3042;
export const CF_ERROR_BAD_MODEL_ID_ALT = 5007;
export const CF_ERROR_NEEDS_PAID = 5035;
export const CF_ERROR_ACCOUNT_BLOCKED = 3023;
export const CF_ERROR_TIMEOUT = 3007;
export const CF_ERROR_ABORTED = 3008;

const KNOWN_ERROR_CODES: readonly number[] = [
  3003, 3006, 3007, 3008, 3023, 3036, 3039, 3040, 3042, 5004, 5007, 5035,
];

export const CLOUDFLARE_API_BASE =
  "https://api.cloudflare.com/client/v4/accounts";

export function cloudflareChatUrl(accountId: string): string {
  return `${CLOUDFLARE_API_BASE}/${accountId}/ai/v1/chat/completions`;
}

export type ChatRole = "system" | "user" | "assistant";

export type ChatRequestBody = {
  model: string;
  messages: Array<{ role: ChatRole; content: string }>;
  stream: true;
  temperature: number;
  max_tokens: number;
  rejectIfBusy: true;
};

export function buildChatRequestBody(params: {
  model: string;
  systemPrompt: string;
  messages: ReadonlyArray<{ role: "user" | "assistant"; text: string }>;
}): ChatRequestBody {
  return {
    model: params.model,
    messages: [
      { role: "system", content: params.systemPrompt },
      ...params.messages.map((m) => ({
        role: m.role,
        content: m.text,
      })),
    ],
    stream: true,
    temperature: 0.2,
    max_tokens: 800,
    rejectIfBusy: true,
  };
}

export type ChatDelta =
  | { kind: "content"; text: string }
  | { kind: "done" }
  | { kind: "usage"; usage: unknown }
  | { kind: "ignore" };

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

export function readChatDeltaContent(chunk: unknown): string | null {
  const choices = asRecord(chunk)?.choices;
  if (!Array.isArray(choices) || choices.length === 0) return null;
  const delta = asRecord(asRecord(choices[0])?.delta);
  const content = delta?.content;
  return typeof content === "string" && content.length > 0 ? content : null;
}

export function parseChatLine(raw: string): ChatDelta | null {
  const line = raw.trim();
  if (!line.startsWith("data:")) return null;
  const payload = line.slice(5).trim();
  if (!payload) return null;
  if (payload === "[DONE]") return { kind: "done" };

  let chunk: unknown;
  try {
    chunk = JSON.parse(payload);
  } catch {
    return null;
  }

  const content = readChatDeltaContent(chunk);
  if (content !== null) return { kind: "content", text: content };

  const usage = asRecord(chunk)?.usage;
  if (usage) return { kind: "usage", usage };

  return { kind: "ignore" };
}

export type ChatStreamParser = {
  push(chunk: string): ChatDelta[];
  flush(): ChatDelta[];
};

export function createChatStreamParser(): ChatStreamParser {
  let buffer = "";

  function parseLines(lines: string[]): ChatDelta[] {
    const deltas: ChatDelta[] = [];
    for (const line of lines) {
      const delta = parseChatLine(line);
      if (delta) deltas.push(delta);
    }
    return deltas;
  }

  return {
    push(chunk) {
      buffer += chunk;
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      return parseLines(lines);
    },
    flush() {
      const rest = buffer;
      buffer = "";
      if (!rest.trim()) return [];
      return parseLines([rest]);
    },
  };
}

function asCode(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value)) return value;
  if (typeof value === "string" && /^\d+$/.test(value.trim())) {
    return Number(value.trim());
  }
  return null;
}

function codeFromDetails(value: unknown): number | null {
  const direct = asCode(value);
  if (direct !== null) return direct;
  const nested = asCode(asRecord(value)?.code);
  return nested;
}

function codeFromJson(body: unknown): number | null {
  const record = asRecord(body);
  if (!record) return asCode(body);

  const errors = record.errors;
  if (Array.isArray(errors)) {
    for (const entry of errors) {
      const code = asCode(asRecord(entry)?.code);
      if (code !== null) return code;
    }
  }

  const error = record.error;
  if (error !== undefined) {
    const direct = asCode(error);
    if (direct !== null) return direct;
    const errorRecord = asRecord(error);
    if (errorRecord) {
      const code = asCode(errorRecord.code);
      if (code !== null) return code;
      const details = codeFromDetails(errorRecord.details);
      if (details !== null) return details;
    }
  }

  return asCode(record.code);
}

export function parseCloudflareErrorCode(bodyText: string): number | null {
  const text = bodyText.trim();
  if (!text) return null;

  try {
    const code = codeFromJson(JSON.parse(text));
    if (code !== null) return code;
  } catch {}

  for (const code of KNOWN_ERROR_CODES) {
    if (new RegExp(`\\b${code}\\b`).test(text)) return code;
  }
  return null;
}
