import type { Db } from "mongodb";
import { AVAILABILITY_IDLE_MS } from "../../config/availability.js";
import { publishToUser } from "../platform/sse.js";
import { getDb } from "./db.js";
import { genId } from "./ids.js";
import { notifyUser } from "./notification-writes.js";

export const SWEEP_INTERVAL_MS = 60_000;

export const PRESENCE_STALE_MS = 3 * 60 * 1000;

export const STALE_SERVING_MS = 90 * 60 * 1000;

export async function sweepStaleAvailability(db: Db): Promise<void> {
  const cutoff = new Date(Date.now() - AVAILABILITY_IDLE_MS);
  const stale = await db
    .collection<{ _id: string; adviserId: string; departmentId: string }>(
      "adviser_availability",
    )
    .find({
      isOpen: true,
      $or: [{ lastActiveAt: { $lt: cutoff } }, { lastActiveAt: null }],
    } as never)
    .toArray();
  if (stale.length === 0) return;

  const adviserIds = [...new Set(stale.map((s) => s.adviserId))];
  const serving = await db
    .collection<{ departmentId: string; servedById: string }>(
      "enrollment_queue",
    )
    .find({ status: "IN_PROGRESS", servedById: { $in: adviserIds } } as never)
    .toArray();
  const servingKeys = new Set(
    serving.map((s) => `${s.servedById}:${s.departmentId}`),
  );
  const toClose = stale.filter(
    (s) => !servingKeys.has(`${s.adviserId}:${s.departmentId}`),
  );
  if (toClose.length === 0) return;

  const now = new Date();
  await db.collection("adviser_availability").updateMany(
    {
      _id: { $in: toClose.map((s) => s._id) },
      isOpen: true,
      $or: [{ lastActiveAt: { $lt: cutoff } }, { lastActiveAt: null }],
    } as never,
    { $set: { isOpen: false, closedAt: now, autoClosedAt: now } } as never,
  );
  await db.collection("adviser_department").deleteMany({
    $or: toClose.map((s) => ({
      adviserId: s.adviserId,
      departmentId: s.departmentId,
    })),
  } as never);
}

export async function sweepStaleServing(db: Db): Promise<void> {
  const cutoff = new Date(Date.now() - STALE_SERVING_MS);
  const staleEntries = await db
    .collection<{
      _id: string;
      departmentId: string;
      academicYearId: string;
      servedById?: string | null;
      servedAt?: Date | null;
      joinedAt: Date;
      studentProfileId?: string;
    }>("enrollment_queue")
    .find({
      status: "IN_PROGRESS",
      $or: [
        { servedAt: { $lt: cutoff } },
        { servedAt: null, joinedAt: { $lt: cutoff } },
      ],
    } as never)
    .toArray();
  if (staleEntries.length === 0) return;

  const now = new Date();
  for (const entry of staleEntries) {
    const reverted = await db.collection("enrollment_queue").updateOne(
      { _id: entry._id, status: "IN_PROGRESS" } as never,
      {
        $set: { status: "WAITING", servedById: null, servedAt: null },
      } as never,
    );
    if ((reverted.matchedCount ?? 0) === 0) continue;

    const profile = await db
      .collection<{ _id: string; userId: string }>("student_profile")
      .findOne({ _id: entry.studentProfileId } as never);
    if (profile) publishToUser(String(profile.userId), "queue");

    await db.collection("admin_action_log").insertOne({
      _id: genId("admin-action"),
      actorId: entry.servedById ?? "system",
      action: "AUTO_RETURN_STALE_SERVING",
      targetRef: `EnrollmentQueue:${String(entry._id)}`,
      at: now,
    } as never);
    if (entry.servedById) {
      await notifyUser(
        db,
        entry.servedById,
        "STALE_SERVING_RETURNED",
        "Serving lock expired",
        "A student you were serving was returned to the queue after 90 minutes of inactivity.",
      );
    }
  }
}

async function runSweeps(db: Db): Promise<void> {
  await sweepStaleAvailability(db);
  await sweepStaleServing(db);
}

type SweepOptions = {
  intervalMs?: number;
  runAtStart?: boolean;
  runSweep?: (db: Db) => Promise<void>;
  getDb?: () => Promise<Db>;
  logger?: (message: string) => void;
  label?: string;
};

function defaultLog(message: string): void {
  console.log(message);
}

function describeError(error: unknown): string {
  if (error instanceof Error) return error.stack ?? error.message;
  return String(error);
}

export function startSweeps(options: SweepOptions = {}): () => void {
  const intervalMs = options.intervalMs ?? SWEEP_INTERVAL_MS;
  const sweep = options.runSweep ?? runSweeps;
  const connect = options.getDb ?? getDb;
  const log = options.logger ?? defaultLog;
  const label = options.label ?? "sweeps";
  let running = false;

  const runOnce = async (): Promise<void> => {
    if (running) {
      log(`[${label}] tick skipped — the previous sweep is still running`);
      return;
    }
    running = true;
    try {
      await sweep(await connect());
    } catch (error) {
      log(
        `[${label}] sweep failed, continuing to the next tick:\n${describeError(error)}`,
      );
    } finally {
      running = false;
    }
  };

  const timer = setInterval(() => {
    void runOnce();
  }, intervalMs);
  timer.unref?.();

  if (options.runAtStart !== false) void runOnce();

  let stopped = false;
  return () => {
    if (stopped) return;
    stopped = true;
    clearInterval(timer);
  };
}
