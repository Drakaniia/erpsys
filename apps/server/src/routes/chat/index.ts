import express, {
  Router,
  type Request,
  type Response as ExpressResponse,
} from "express";
import { z } from "zod";
import {
  ACCOUNT_EXHAUSTED_MESSAGE,
  DEFAULT_MAINTENANCE_MESSAGE,
  STUDENT_LIMIT_MESSAGE,
  commitUsage,
  estimateTokens,
  markDayExhausted,
  precheckBudget,
  utcDayKey,
  type BudgetDecision,
} from "../../lib/chat/budget.js";
import {
  CF_ERROR_ABORTED,
  CF_ERROR_ACCOUNT_BLOCKED,
  CF_ERROR_ACCOUNT_LIMITED,
  CF_ERROR_BAD_MODEL_ID,
  CF_ERROR_BAD_MODEL_ID_ALT,
  CF_ERROR_NEEDS_PAID,
  CF_ERROR_REQUEST_TOO_LARGE,
  CF_ERROR_TIMEOUT,
  buildChatRequestBody,
  cloudflareChatUrl,
  createChatStreamParser,
  parseCloudflareErrorCode,
  type ChatDelta,
} from "../../lib/chat/cloudflare.js";
import {
  buildSystemPrompt,
  getKnowledgeContent,
  getStudentChatContext,
} from "../../lib/chat/knowledge.js";
import {
  acquireProviderSlot,
  configurePacer,
  orderModels,
  parseRetryAfterSeconds,
  pauseProviderUntil,
  reportModelOutcome,
} from "../../lib/chat/model-router.js";
import { getDbSync } from "../../lib/db/db.js";
import { env } from "../../lib/platform/env.js";
import { integrationEnabled } from "../../lib/platform/integration-settings.js";
import {
  clientIp,
  createRateLimitBudget,
} from "../../lib/platform/rate-limit.js";
import {
  requireSession,
  requireSurface,
  sessionUser,
} from "../../middleware/auth.js";

/**
 * `/api` — the chat stream, mounted ahead of the global JSON parser: its body
 * is capped at 100kb and the SSE response must not be buffered.
 */
export const chatRouter = Router();

const ChatBodySchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant", "model"]),
        text: z.string().min(1).max(2000),
      }),
    )
    .min(1)
    .max(20),
});

type NormalizedMessage = { role: "user" | "assistant"; text: string };

const CHAT_RATE_LIMIT_MESSAGE = "Too many requests — try again in a minute.";
const CHAT_GENERIC_ERROR_MESSAGE =
  "I'm getting a lot of questions right now — try again in a minute.";
const CHAT_UNREACHABLE_MESSAGE =
  "I can't reach the assistant right now — please try again in a little while.";
const CHAT_INTERRUPTED_MESSAGE = "The reply was interrupted — please try again.";
const CHAT_TOO_LONG_MESSAGE =
  "That conversation got too long — start a new chat and ask again.";
const DEV_CANNED_REPLY = [
  "The chatbot is running without Cloudflare credentials, so this is a canned reply.",
  "Add CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN to .env for real answers.",
].join(" ");

const chatRateLimit = createRateLimitBudget({ name: "student-chat", windowMs: 60_000, max: 10 });

configurePacer(env.CLOUDFLARE_RPM);

const describeError = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

function formatValidationMessage(
  issues: Array<{ path: PropertyKey[]; code: string }>,
): string {
  const first = issues[0];
  if (!first)
    return "messages array is required (1–20 messages, each ≤ 2000 chars)";
  const [root, index, field] = first.path;
  if (first.path.length === 1 && root === "messages") {
    if (first.code === "too_small")
      return "messages must have at least 1 message.";
    if (first.code === "too_big")
      return "messages can have at most 20 messages.";
    return "messages must be an array of { role, text } messages.";
  }
  if (root === "messages" && typeof index === "number") {
    const label = `messages[${index}]`;
    if (field === "role") return `${label}.role must be "user" or "assistant".`;
    if (field === "text") {
      if (first.code === "too_big")
        return `${label}.text is over 2000 characters — shorten it and try again.`;
      if (first.code === "too_small")
        return `${label}.text is empty — type a message first.`;
      return `${label}.text must be a string.`;
    }
  }
  return "The request body is invalid — check the messages field.";
}

async function streamChat(req: Request, res: ExpressResponse): Promise<void> {
  const user = sessionUser(req);
  const decision = await chatRateLimit.checkAsync(`user:${user.id}|ip:${clientIp(req)}`);
  if (!decision.allowed) {
    res.setHeader("Retry-After", String(decision.retryAfterSeconds));
    res.status(429).json({ error: CHAT_RATE_LIMIT_MESSAGE });
    return;
  }

  const parsed = ChatBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: formatValidationMessage(parsed.error.issues) });
    return;
  }

  if (
    !env.CLOUDFLARE_CHAT_ENABLED ||
    !(await integrationEnabled("cloudflareChat"))
  ) {
    res.status(503).json({
      error:
        env.CLOUDFLARE_MAINTENANCE_MESSAGE.trim() || DEFAULT_MAINTENANCE_MESSAGE,
    });
    return;
  }

  const messages: NormalizedMessage[] = parsed.data.messages.map((m) => ({
    role: m.role === "user" ? "user" : "assistant",
    text: m.text,
  }));

  const clientAbort = new AbortController();
  res.on("close", () => {
    if (!res.writableEnded) clientAbort.abort();
  });
  const clientGone = () => clientAbort.signal.aborted || res.writableEnded;

  const send = (data: unknown) => {
    if (clientGone()) return;
    if (!res.headersSent) {
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });
    }
    try {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    } catch {}
  };
  const finish = () => {
    if (clientGone()) return;
    try {
      res.end();
    } catch {}
  };
  const fail = (message: string) => {
    send({ type: "error", message });
    finish();
  };

  if (
    env.CLOUDFLARE_API_TOKEN.trim() === "" ||
    env.CLOUDFLARE_ACCOUNT_ID.trim() === ""
  ) {
    if (env.NODE_ENV === "development") {
      send({ type: "start", model: "dev-canned" });
      DEV_CANNED_REPLY.split(" ").forEach((word, index) => {
        send({ type: "token", content: index === 0 ? word : ` ${word}` });
      });
      send({ type: "done" });
      finish();
    } else {
      console.warn(
        "[chat] CLOUDFLARE_ACCOUNT_ID/CLOUDFLARE_API_TOKEN are not set — the assistant cannot answer.",
      );
      fail(CHAT_UNREACHABLE_MESSAGE);
    }
    return;
  }

  const db = getDbSync();
  const day = utcDayKey();
  const userId = user.id;

  let budget: BudgetDecision = { allowed: true };
  try {
    budget = await precheckBudget(db, day, userId, {
      dailyNeuronCap: env.CLOUDFLARE_DAILY_NEURON_CAP,
      tokensPerStudentPerDay: env.CLOUDFLARE_TOKENS_PER_STUDENT_PER_DAY,
    });
  } catch (error) {
    console.warn(
      `[chat] budget precheck failed, allowing the turn: ${describeError(error)}`,
    );
  }
  if (!budget.allowed) {
    fail(
      budget.reason === "account"
        ? ACCOUNT_EXHAUSTED_MESSAGE
        : STUDENT_LIMIT_MESSAGE,
    );
    return;
  }

  const [knowledgeContent, studentCtx] = await Promise.all([
    getKnowledgeContent(),
    getStudentChatContext(userId, user.name ?? null),
  ]);
  const systemPrompt = buildSystemPrompt(knowledgeContent, studentCtx);
  const promptTokens = estimateTokens(
    systemPrompt + messages.map((m) => m.text).join("\n"),
  );
  const models = orderModels([
    env.CLOUDFLARE_PRIMARY_MODEL,
    ...env.CLOUDFLARE_FALLBACK_MODELS.split(",")
      .map((model) => model.trim())
      .filter(Boolean),
  ]);

  const upstreamAbort = new AbortController();
  const onClientAbort = () => upstreamAbort.abort();
  clientAbort.signal.addEventListener("abort", onClientAbort, { once: true });
  if (clientAbort.signal.aborted) upstreamAbort.abort();

  const deadlineAt = Date.now() + env.CLOUDFLARE_REQUEST_DEADLINE_MS;
  let deadlineExpired = false;
  const deadlineTimer = setTimeout(() => {
    deadlineExpired = true;
    upstreamAbort.abort();
  }, env.CLOUDFLARE_REQUEST_DEADLINE_MS);

  let streamedModel: string | null = null;
  let outputText = "";
  let accountLimitedRetried = false;

  try {
    for (const model of models) {
      for (let attempt = 1; attempt <= 2; attempt++) {
        if (clientGone()) return;

        if (deadlineExpired || Date.now() >= deadlineAt) {
          console.warn(
            `[chat] deadline (${env.CLOUDFLARE_REQUEST_DEADLINE_MS}ms) reached before ${model} attempt ${attempt}`,
          );
          fail(CHAT_INTERRUPTED_MESSAGE);
          return;
        }

        let response: Response | undefined;
        try {
          await acquireProviderSlot();
          response = await fetch(cloudflareChatUrl(env.CLOUDFLARE_ACCOUNT_ID), {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}`,
            },
            body: JSON.stringify(
              buildChatRequestBody({ model, systemPrompt, messages }),
            ),
            signal: upstreamAbort.signal,
          });
        } catch (error) {
          if (clientGone()) return;
          console.warn(
            `[chat] ${model} attempt ${attempt} could not be reached: ${describeError(error)}${deadlineExpired ? " (deadline)" : ""}`,
          );
          reportModelOutcome(model, "unavailable");
          pauseProviderUntil(Date.now() + 1_000);
          if (deadlineExpired) {
            fail(CHAT_INTERRUPTED_MESSAGE);
            return;
          }
          if (attempt === 1) continue;
          break;
        }

        if (response.ok) {
          reportModelOutcome(model, "ok");
          streamedModel = model;
          send({ type: "start", model });

          const applyDelta = (delta: ChatDelta) => {
            if (delta.kind === "content") {
              outputText += delta.text;
              send({ type: "token", content: delta.text });
            } else if (delta.kind === "usage") {
              console.warn(
                `[chat] ${model} reported usage: ${JSON.stringify(delta.usage)}`,
              );
            }
          };

          try {
            const reader = response.body?.getReader();
            if (!reader) throw new Error("No response body");
            const decoder = new TextDecoder();
            const parser = createChatStreamParser();
            for (;;) {
              if (clientGone()) return;
              const { done, value } = await reader.read();
              if (done) break;
              for (const delta of parser.push(
                decoder.decode(value, { stream: true }),
              )) {
                applyDelta(delta);
              }
            }
            for (const delta of parser.flush()) applyDelta(delta);
            send({ type: "done" });
            finish();
            return;
          } catch (error) {
            if (clientGone()) return;
            console.error(
              `[chat] stream from ${model} failed: ${describeError(error)}`,
            );
            fail(CHAT_INTERRUPTED_MESSAGE);
            return;
          }
        }

        const status = response.status;
        const retryAfter = parseRetryAfterSeconds(
          response.headers.get("retry-after"),
        );
        const code = parseCloudflareErrorCode(
          await response.text().catch(() => ""),
        );
        console.warn(
          `[chat] ${model} attempt ${attempt} upstream ${status} (code ${code ?? "unknown"})`,
        );

        if (status === 429 && code === CF_ERROR_ACCOUNT_LIMITED) {
          if (!accountLimitedRetried) {
            accountLimitedRetried = true;
            continue;
          }
          console.error(
            "[chat] the account's daily neurons are used up (3036) — resting until midnight UTC",
          );
          try {
            await markDayExhausted(db, day);
          } catch (error) {
            console.warn(
              `[chat] could not record the exhausted day: ${describeError(error)}`,
            );
          }
          fail(ACCOUNT_EXHAUSTED_MESSAGE);
          return;
        }

        if (status === 429 || status >= 500) {
          reportModelOutcome(model, "unavailable");
          pauseProviderUntil(
            Date.now() + Math.min((retryAfter ?? 1) * 1000, 10_000),
          );
          continue;
        }

        if (
          (status === 404 && code === CF_ERROR_BAD_MODEL_ID) ||
          (status === 400 && code === CF_ERROR_BAD_MODEL_ID_ALT)
        ) {
          console.error(
            `[chat] the model id ${model} is not usable (code ${code}) — skipping its remaining attempts`,
          );
          reportModelOutcome(model, "unavailable");
          break;
        }

        if (status === 400 || status === 404) {
          console.error(
            `[chat] ${model} rejected the request (HTTP ${status}, code ${code ?? "unknown"})`,
          );
          reportModelOutcome(model, "unavailable");
          break;
        }

        if (
          status === 403 &&
          (code === CF_ERROR_NEEDS_PAID || code === CF_ERROR_ACCOUNT_BLOCKED)
        ) {
          console.error(
            `[chat] account-level failure (code ${code}) — stopping the chain. This needs an operator.`,
          );
          fail(CHAT_UNREACHABLE_MESSAGE);
          return;
        }

        if (status === 413 && code === CF_ERROR_REQUEST_TOO_LARGE) {
          console.warn("[chat] the request was too large for the provider.");
          fail(CHAT_TOO_LONG_MESSAGE);
          return;
        }

        if (
          status === 408 ||
          code === CF_ERROR_TIMEOUT ||
          code === CF_ERROR_ABORTED
        ) {
          reportModelOutcome(model, "unavailable");
          pauseProviderUntil(Date.now() + 1_000);
          continue;
        }

        fail(CHAT_UNREACHABLE_MESSAGE);
        return;
      }
    }

    fail(CHAT_GENERIC_ERROR_MESSAGE);
  } finally {
    clearTimeout(deadlineTimer);
    clientAbort.signal.removeEventListener("abort", onClientAbort);

    if (streamedModel) {
      try {
        await commitUsage(db, {
          day,
          userId,
          model: streamedModel,
          inputTokens: promptTokens,
          outputTokens: estimateTokens(outputText),
        });
      } catch (error) {
        console.warn(
          `[chat] could not record this turn's usage: ${describeError(error)}`,
        );
      }
    }
  }
}

/**
 * `POST /api/chat/stream`
 * Access: session + student surface.
 * Use: send one chat turn — JSON body, 100kb cap.
 * Returns: the SSE stream itself; no `{ data }` envelope.
 */
chatRouter.post(
  "/chat/stream",
  express.json({ limit: "100kb" }),
  requireSession,
  requireSurface("student"),
  streamChat,
);
