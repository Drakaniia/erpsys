import type { Db } from "mongodb";
import { COLLECTIONS } from "../db/db.js";

export const NEURON_SAFETY_FACTOR = 1.25;

export const ACCOUNT_RESERVE_RATIO = 0.9;

export const CHARS_PER_TOKEN = 4;

export const CHAT_USAGE_RETENTION_DAYS = 30;

export const ACCOUNT_EXHAUSTED_MESSAGE =
  "The assistant has hit its daily limit — it will be back after midnight UTC. For an urgent question, ask an SBO officer at the office.";

export const STUDENT_LIMIT_MESSAGE =
  "You've reached today's chatbot limit — try again after midnight UTC.";

export const DEFAULT_MAINTENANCE_MESSAGE =
  "The assistant is offline for maintenance.";

export type NeuronRate = { input: number; output: number };

export const NEURON_RATES: Record<string, NeuronRate> = {
  "@cf/openai/gpt-oss-20b": { input: 18_182, output: 27_273 },
  "@cf/meta/llama-3.3-70b-instruct-fp8-fast": {
    input: 26_636,
    output: 204_818,
  },
  "@cf/meta/llama-3.1-8b-instruct-fp8": { input: 13_818, output: 26_091 },
};

export const UNKNOWN_MODEL_RATE: NeuronRate = {
  input: 26_636,
  output: 204_818,
};

export function neuronRateFor(model: string): NeuronRate {
  return NEURON_RATES[model] ?? UNKNOWN_MODEL_RATE;
}

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

export function estimateNeurons(input: {
  model: string;
  inputTokens: number;
  outputTokens: number;
}): number {
  const rate = neuronRateFor(input.model);
  const raw =
    (Math.max(0, input.inputTokens) * rate.input +
      Math.max(0, input.outputTokens) * rate.output) /
    1_000_000;
  return Math.ceil(raw * NEURON_SAFETY_FACTOR);
}

export function utcDayKey(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export function expiresAtForDay(day: string): Date {
  const start = Date.parse(`${day}T00:00:00.000Z`);
  return new Date(start + CHAT_USAGE_RETENTION_DAYS * 24 * 60 * 60 * 1000);
}

export function totalDocId(day: string): string {
  return `${day}:total`;
}

export function userDocId(day: string, userId: string): string {
  return `${day}:user:${userId}`;
}

export type ChatUsageTotalDoc = {
  _id: string;
  day: string;
  tokens: number;
  neurons: number;
  turns: number;
  exhausted: boolean;
  exhaustedAt?: Date;
  expiresAt: Date;
};

export type ChatUsageUserDoc = {
  _id: string;
  day: string;
  userId: string;
  tokens: number;
  neurons: number;
  turns: number;
  expiresAt: Date;
};

export type DayUsage = {
  tokens: number;
  neurons: number;
  turns: number;
  exhausted: boolean;
};

const EMPTY_USAGE: DayUsage = {
  tokens: 0,
  neurons: 0,
  turns: 0,
  exhausted: false,
};

function toDayUsage(doc: unknown): DayUsage {
  if (!doc || typeof doc !== "object") return { ...EMPTY_USAGE };
  const row = doc as Record<string, unknown>;
  return {
    tokens: typeof row.tokens === "number" ? row.tokens : 0,
    neurons: typeof row.neurons === "number" ? row.neurons : 0,
    turns: typeof row.turns === "number" ? row.turns : 0,
    exhausted: row.exhausted === true,
  };
}

export type DayUsageSnapshot = { total: DayUsage; user: DayUsage };

export async function readDayUsage(
  db: Db,
  day: string,
  userId: string,
): Promise<DayUsageSnapshot> {
  const collection = db.collection(COLLECTIONS.chatUsage);
  const [total, user] = await Promise.all([
    collection.findOne({ _id: totalDocId(day) } as never),
    collection.findOne({ _id: userDocId(day, userId) } as never),
  ]);
  return { total: toDayUsage(total), user: toDayUsage(user) };
}

export type BudgetLimits = {
  dailyNeuronCap: number;
  tokensPerStudentPerDay: number;
};

export type BudgetDecision =
  | { allowed: true }
  | { allowed: false; reason: "account" | "student" };

export function decideBudget(
  usage: DayUsageSnapshot,
  limits: BudgetLimits,
): BudgetDecision {
  if (usage.total.exhausted) return { allowed: false, reason: "account" };
  if (usage.total.neurons >= limits.dailyNeuronCap * ACCOUNT_RESERVE_RATIO) {
    return { allowed: false, reason: "account" };
  }
  if (usage.user.tokens >= limits.tokensPerStudentPerDay) {
    return { allowed: false, reason: "student" };
  }
  return { allowed: true };
}

export async function precheckBudget(
  db: Db,
  day: string,
  userId: string,
  limits: BudgetLimits,
): Promise<BudgetDecision> {
  return decideBudget(await readDayUsage(db, day, userId), limits);
}

export async function commitUsage(
  db: Db,
  input: {
    day: string;
    userId: string;
    model: string;
    inputTokens: number;
    outputTokens: number;
  },
): Promise<void> {
  const { day, userId, model } = input;
  const tokens =
    Math.max(0, input.inputTokens) + Math.max(0, input.outputTokens);
  const neurons = estimateNeurons({
    model,
    inputTokens: input.inputTokens,
    outputTokens: input.outputTokens,
  });
  const expiresAt = expiresAtForDay(day);
  const collection = db.collection(COLLECTIONS.chatUsage);

  await Promise.all([
    collection.updateOne(
      { _id: totalDocId(day) } as never,
      {
        $inc: { tokens, neurons, turns: 1 },
        $setOnInsert: { day, exhausted: false, expiresAt },
      } as never,
      { upsert: true },
    ),
    collection.updateOne(
      { _id: userDocId(day, userId) } as never,
      {
        $inc: { tokens, neurons, turns: 1 },
        $setOnInsert: { day, userId, expiresAt },
      } as never,
      { upsert: true },
    ),
  ]);
}

export async function markDayExhausted(
  db: Db,
  day: string,
  now: Date = new Date(),
): Promise<void> {
  await db.collection(COLLECTIONS.chatUsage).updateOne(
    { _id: totalDocId(day) } as never,
    {
      $set: { exhausted: true, exhaustedAt: now },
      $setOnInsert: {
        day,
        tokens: 0,
        neurons: 0,
        turns: 0,
        expiresAt: expiresAtForDay(day),
      },
    } as never,
    { upsert: true },
  );
}
