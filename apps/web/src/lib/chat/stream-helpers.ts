export type ChatViewMessage = {
  role: "user" | "bot";
  text: string;
  failed?: boolean;
  streaming?: boolean;
  stopped?: boolean;
};

export function buildApiMessages(
  messages: ChatViewMessage[],
): Array<{ role: "user" | "assistant"; text: string }> {
  return messages
    .filter((m) => !m.streaming && !m.failed && m.text.trim().length > 0)
    .map((m) => ({
      role: m.role === "bot" ? ("assistant" as const) : ("user" as const),
      text: m.text,
    }));
}

type ValidationIssue = {
  path: ReadonlyArray<PropertyKey>;
  code: string;
};

const MAX_VALIDATION_MESSAGE_LENGTH = 240;
const FALLBACK_VALIDATION_MESSAGE =
  "messages array is required (1–20 messages, each ≤ 2000 chars)";

function describeValidationIssue(issue: ValidationIssue): string {
  const { path, code } = issue;
  const [root, index, field] = path;

  if (path.length === 0) {
    return "The request body must be an object with a messages array.";
  }

  if (path.length === 1 && root === "messages") {
    if (code === "too_small") return "messages must have at least 1 message.";
    if (code === "too_big") return "messages can have at most 20 messages.";
    return "messages must be an array of { role, text } messages.";
  }

  if (root === "messages" && typeof index === "number") {
    const label = `messages[${index}]`;
    if (field === "role") {
      return `${label}.role must be "user" or "assistant".`;
    }
    if (field === "text") {
      if (code === "too_big") {
        return `${label}.text is over 2000 characters — shorten it and try again.`;
      }
      if (code === "too_small") {
        return `${label}.text is empty — type a message first.`;
      }
      return `${label}.text must be a string.`;
    }
    return `${label} is invalid — check its role and text.`;
  }

  return "The request body is invalid — check the messages field.";
}

export function formatValidationMessage(issues: ValidationIssue[]): string {
  if (issues.length === 0) return FALLBACK_VALIDATION_MESSAGE;

  const message = issues.slice(0, 2).map(describeValidationIssue).join(" ");

  return message.length > MAX_VALIDATION_MESSAGE_LENGTH
    ? `${message.slice(0, MAX_VALIDATION_MESSAGE_LENGTH - 1)}…`
    : message;
}

export function formatFriendlyError(
  statusCode: number,
  errorBody: string,
): string {
  void errorBody;

  if (statusCode === 429) {
    return "I'm getting a lot of questions right now — try again in a minute.";
  }

  if (statusCode === 400) {
    // Bad request — don't expose internals
    return "Sorry, I hit a snag processing that. Please try again.";
  }

  if (statusCode === 401 || statusCode === 403) {
    return "You need to be signed in to use the chatbot.";
  }

  if (statusCode >= 500) {
    return "The assistant is taking a break — try again in a moment.";
  }

  // Unknown error — generic friendly message
  return "Something went wrong — please try again.";
}
