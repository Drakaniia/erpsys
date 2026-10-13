import { describe, expect, it } from "vitest";
import type { Db } from "mongodb";
import { COLLECTIONS } from "../db/db.js";
import {
  ACCOUNT_RESERVE_RATIO,
  CHAT_USAGE_RETENTION_DAYS,
  NEURON_RATES,
  NEURON_SAFETY_FACTOR,
  UNKNOWN_MODEL_RATE,
  commitUsage,
  decideBudget,
  estimateNeurons,
  estimateTokens,
  expiresAtForDay,
  markDayExhausted,
  neuronRateFor,
  precheckBudget,
  readDayUsage,
  totalDocId,
  userDocId,
  utcDayKey,
  type BudgetLimits,
} from "./budget.js";

type Row = Record<string, unknown>;

/** Enough of the Mongo API for `$inc`/`$setOnInsert` upserts. */
function fakeDb() {
  const collections = new Map<string, Map<string, Row>>();

  function rowsFor(name: string): Map<string, Row> {
    let rows = collections.get(name);
    if (!rows) {
      rows = new Map();
      collections.set(name, rows);
    }
    return rows;
  }

  const db = {
    collection(name: string) {
      const rows = rowsFor(name);
      return {
        async findOne(filter: Row) {
          const row = rows.get(String(filter._id));
          return row ? { ...row } : null;
        },
        async updateOne(
          filter: Row,
          update: { $inc?: Row; $set?: Row; $setOnInsert?: Row },
          options?: { upsert?: boolean },
        ) {
          const id = String(filter._id);
          let row = rows.get(id);
          if (!row) {
            if (!options?.upsert) return { matchedCount: 0, upsertedCount: 0 };
            row = { _id: id, ...(update.$setOnInsert ?? {}) };
            rows.set(id, row);
          }
          if (update.$set) Object.assign(row, update.$set);
          for (const [key, value] of Object.entries(update.$inc ?? {})) {
            const current =
              typeof row[key] === "number" ? (row[key] as number) : 0;
            row[key] = current + Number(value);
          }
          return { matchedCount: 1, upsertedCount: 1 };
        },
      };
    },
  } as unknown as Db;

  return { db, collections };
}

const DAY = "2026-10-14";
const LIMITS: BudgetLimits = {
  dailyNeuronCap: 10_000,
  tokensPerStudentPerDay: 20_000,
};

describe("estimates", () => {
  it("counts tokens as characters over four, rounded up", () => {
    expect(estimateTokens("")).toBe(0);
    expect(estimateTokens("abcd")).toBe(1);
    expect(estimateTokens("abcde")).toBe(2);
    expect(estimateTokens("a".repeat(8_000))).toBe(2_000);
  });

  it("uses the published rate for a known model, inflated by the safety factor", () => {
    const rate = NEURON_RATES["@cf/openai/gpt-oss-20b"];
    const raw = (1_000_000 * rate.input) / 1_000_000;
    expect(
      estimateNeurons({
        model: "@cf/openai/gpt-oss-20b",
        inputTokens: 1_000_000,
        outputTokens: 0,
      }),
    ).toBe(Math.ceil(raw * NEURON_SAFETY_FACTOR));
    expect(NEURON_SAFETY_FACTOR).toBeGreaterThan(1);
  });

  it("bills output tokens at the model's own output rate", () => {
    const rate = NEURON_RATES["@cf/openai/gpt-oss-20b"];
    const withOutput = estimateNeurons({
      model: "@cf/openai/gpt-oss-20b",
      inputTokens: 0,
      outputTokens: 1_000_000,
    });
    expect(withOutput).toBe(Math.ceil(rate.output * NEURON_SAFETY_FACTOR));
    expect(rate.output).toBeGreaterThan(rate.input);
  });

  it("over-counts an unknown model instead of under-counting it", () => {
    expect(neuronRateFor("@cf/nope/nope")).toEqual(UNKNOWN_MODEL_RATE);
    const unknown = estimateNeurons({
      model: "@cf/nope/nope",
      inputTokens: 3_200,
      outputTokens: 300,
    });
    expect(unknown).toBeGreaterThan(
      estimateNeurons({
        model: "@cf/openai/gpt-oss-20b",
        inputTokens: 3_200,
        outputTokens: 300,
      }),
    );
  });

  it("matches the spec's worked example for one turn", () => {
    // ~3,200 input + ~300 output on the primary model is ~66 neurons before the
    // safety factor, which puts the count the guard uses at ~83.
    const rate = NEURON_RATES["@cf/openai/gpt-oss-20b"];
    const raw = (3_200 * rate.input + 300 * rate.output) / 1_000_000;
    expect(raw).toBeCloseTo(66, 0);
    expect(
      estimateNeurons({
        model: "@cf/openai/gpt-oss-20b",
        inputTokens: 3_200,
        outputTokens: 300,
      }),
    ).toBe(Math.ceil(raw * NEURON_SAFETY_FACTOR));
  });
});

describe("the UTC day key", () => {
  it("rolls over at 00:00 UTC, matching Cloudflare's own reset", () => {
    expect(utcDayKey(new Date("2026-10-14T00:00:00.000Z"))).toBe("2026-10-14");
    expect(utcDayKey(new Date("2026-10-14T23:59:59.999Z"))).toBe("2026-10-14");
    expect(utcDayKey(new Date("2026-10-15T00:00:00.000Z"))).toBe("2026-10-15");
  });

  it("powers both document ids from the same string", () => {
    expect(totalDocId(DAY)).toBe("2026-10-14:total");
    expect(userDocId(DAY, "u-1")).toBe("2026-10-14:user:u-1");
  });

  it("expires a day doc about 30 days after its day starts", () => {
    expect(expiresAtForDay(DAY).toISOString()).toBe(
      new Date(
        Date.parse(`${DAY}T00:00:00.000Z`) +
          CHAT_USAGE_RETENTION_DAYS * 24 * 60 * 60 * 1000,
      ).toISOString(),
    );
  });
});

describe("decideBudget", () => {
  const fresh = {
    total: { tokens: 0, neurons: 0, turns: 0, exhausted: false },
    user: { tokens: 0, neurons: 0, turns: 0, exhausted: false },
  };

  it("allows a turn under every limit", () => {
    expect(decideBudget(fresh, LIMITS)).toEqual({ allowed: true });
  });

  it("rests the account at 90% of the cap, keeping a 10% reserve", () => {
    const justUnder = {
      ...fresh,
      total: {
        ...fresh.total,
        neurons: LIMITS.dailyNeuronCap * ACCOUNT_RESERVE_RATIO - 1,
      },
    };
    expect(decideBudget(justUnder, LIMITS)).toEqual({ allowed: true });
    const atReserve = {
      ...fresh,
      total: {
        ...fresh.total,
        neurons: LIMITS.dailyNeuronCap * ACCOUNT_RESERVE_RATIO,
      },
    };
    expect(decideBudget(atReserve, LIMITS)).toEqual({
      allowed: false,
      reason: "account",
    });
  });

  it("rests the account when the day is already marked exhausted", () => {
    expect(
      decideBudget(
        { ...fresh, total: { ...fresh.total, exhausted: true } },
        LIMITS,
      ),
    ).toEqual({ allowed: false, reason: "account" });
  });

  it("applies the per-student share independently of the account", () => {
    expect(
      decideBudget(
        {
          ...fresh,
          user: { ...fresh.user, tokens: LIMITS.tokensPerStudentPerDay },
        },
        LIMITS,
      ),
    ).toEqual({ allowed: false, reason: "student" });
    expect(
      decideBudget(
        {
          ...fresh,
          user: { ...fresh.user, tokens: LIMITS.tokensPerStudentPerDay - 1 },
        },
        LIMITS,
      ),
    ).toEqual({ allowed: true });
  });
});

describe("the Mongo-backed guard", () => {
  it("reads zeroes for a day with no docs yet", async () => {
    const { db } = fakeDb();
    await expect(readDayUsage(db, DAY, "u-1")).resolves.toEqual({
      total: { tokens: 0, neurons: 0, turns: 0, exhausted: false },
      user: { tokens: 0, neurons: 0, turns: 0, exhausted: false },
    });
    await expect(precheckBudget(db, DAY, "u-1", LIMITS)).resolves.toEqual({
      allowed: true,
    });
  });

  it("accumulates prompt and completion tokens into both docs", async () => {
    const { db, collections } = fakeDb();
    await commitUsage(db, {
      day: DAY,
      userId: "u-1",
      model: "@cf/openai/gpt-oss-20b",
      inputTokens: 3_200,
      outputTokens: 300,
    });
    await commitUsage(db, {
      day: DAY,
      userId: "u-1",
      model: "@cf/openai/gpt-oss-20b",
      inputTokens: 1_800,
      outputTokens: 200,
    });

    const rows = collections.get(COLLECTIONS.chatUsage);
    const total = rows?.get(totalDocId(DAY));
    const user = rows?.get(userDocId(DAY, "u-1"));
    expect(total).toMatchObject({ tokens: 5_500, turns: 2, exhausted: false });
    expect(user).toMatchObject({ tokens: 5_500, turns: 2, userId: "u-1" });
    expect(total?.neurons).toBeGreaterThan(0);
    expect(user?.neurons).toBe(total?.neurons);
    expect(total?.expiresAt).toBeInstanceOf(Date);
  });

  it("commits a half-streamed turn too (commit on failure)", async () => {
    const { db, collections } = fakeDb();
    // A stream that died after 40 characters still spent those tokens.
    await commitUsage(db, {
      day: DAY,
      userId: "u-1",
      model: "@cf/openai/gpt-oss-20b",
      inputTokens: 3_200,
      outputTokens: estimateTokens("x".repeat(40)),
    });
    const total = collections.get(COLLECTIONS.chatUsage)?.get(totalDocId(DAY));
    expect(total).toMatchObject({ tokens: 3_210, turns: 1 });
  });

  it("rests the account once the day is marked exhausted", async () => {
    const { db } = fakeDb();
    await markDayExhausted(db, DAY, new Date("2026-10-14T09:00:00.000Z"));
    const usage = await readDayUsage(db, DAY, "u-1");
    expect(usage.total.exhausted).toBe(true);
    await expect(precheckBudget(db, DAY, "u-1", LIMITS)).resolves.toEqual({
      allowed: false,
      reason: "account",
    });
  });

  it("keeps each student's share and each day separate", async () => {
    const { db } = fakeDb();
    await commitUsage(db, {
      day: DAY,
      userId: "u-1",
      model: "@cf/openai/gpt-oss-20b",
      inputTokens: 20_000,
      outputTokens: 0,
    });
    await expect(precheckBudget(db, DAY, "u-1", LIMITS)).resolves.toEqual({
      allowed: false,
      reason: "student",
    });
    // Another student is untouched...
    await expect(precheckBudget(db, DAY, "u-2", LIMITS)).resolves.toEqual({
      allowed: true,
    });
    // ...and so is the next UTC day.
    await expect(
      precheckBudget(db, "2026-10-15", "u-1", LIMITS),
    ).resolves.toEqual({ allowed: true });
  });
});
