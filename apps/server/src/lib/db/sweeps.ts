import { AVAILABILITY_IDLE_MS } from "../../config/availability.js";

import { COLLECTIONS, getDb } from "./db.js";
import { genId } from "./ids.js";

const STALE_SERVING_MS = 90 * 60 * 1000;

export async function sweep(): Promise<void> {
  const db = await getDb();
  const now = new Date();


  const idleCutoff = new Date(now.getTime() - AVAILABILITY_IDLE_MS);
  const idle = {
    isOpen: true,
    $or: [{ lastActiveAt: { $lt: idleCutoff } }, { lastActiveAt: null }],
  };
  const stale = await db
    .collection<{ _id: string; adviserId: string; departmentId: string }>(
      COLLECTIONS.adviserAvailability,
    )
    .find(idle as never)
    .toArray();
  const serving = await db
    .collection<{ departmentId: string; servedById: string }>(
      COLLECTIONS.enrollmentQueue,
    )
    .find({
      status: "IN_PROGRESS",
      servedById: { $in: stale.map((s) => s.adviserId) },
    } as never)
    .toArray();
  const busy = new Set(serving.map((s) => `${s.servedById}:${s.departmentId}`));
  const toClose = stale.filter(
    (s) => !busy.has(`${s.adviserId}:${s.departmentId}`),
  );
  if (toClose.length > 0) {
    await db.collection(COLLECTIONS.adviserAvailability).updateMany(
      { _id: { $in: toClose.map((s) => s._id) }, ...idle } as never,
      { $set: { isOpen: false, closedAt: now, autoClosedAt: now } } as never,
    );
    await db.collection(COLLECTIONS.adviserDepartment).deleteMany({
      $or: toClose.map((s) => ({
        adviserId: s.adviserId,
        departmentId: s.departmentId,
      })),
    } as never);
  }

  const servingCutoff = new Date(now.getTime() - STALE_SERVING_MS);
  const stuck = await db
    .collection<{ _id: string; servedById?: string | null }>(
      COLLECTIONS.enrollmentQueue,
    )
    .find({
      status: "IN_PROGRESS",
      $or: [
        { servedAt: { $lt: servingCutoff } },
        { servedAt: null, joinedAt: { $lt: servingCutoff } },
      ],
    } as never)
    .toArray();
  for (const entry of stuck) {
    const reverted = await db.collection(COLLECTIONS.enrollmentQueue).updateOne(
      { _id: entry._id, status: "IN_PROGRESS" } as never,
      { $set: { status: "WAITING", servedById: null, servedAt: null } } as never,
    );
    if (reverted.matchedCount === 0 || !entry.servedById) continue;
    await db.collection(COLLECTIONS.notification).insertOne({
      _id: genId("notification"),
      userId: entry.servedById,
      type: "STALE_SERVING_RETURNED",
      title: "Serving lock expired",
      body: "A student you were serving was returned to the queue after 90 minutes of inactivity.",
      action: null,
      createdAt: now,
    } as never);
  }

  await db.collection(COLLECTIONS.upload).updateMany(
    { backend: "r2", r2Status: "pending", sessionExpiresAt: { $lte: now } } as never,
    { $set: { r2Status: "abandoned" } } as never,
  );
}

export function startSweeps(run = sweep, label = "sweep"): void {
  let running = false;
  setInterval(() => {
    if (running) return;
    running = true;
    run()
      .catch((error) => console.error(`[${label}] failed`, error))
      .finally(() => (running = false));
  }, 60_000).unref();
}
