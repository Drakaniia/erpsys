import type { Db } from "mongodb";

const SOURCES = [
  "student_profile",
  "adviser_department",
  "step",
  "requirement_item",
  "social_media_link",
  "adviser_availability",
  "availability_window",
] as const;

export async function assertCollectionReadiness(db: Db): Promise<void> {
  const marker = await db.collection<{ _id: string; version: number; completedAt: Date }>("platform_state").findOne({
    _id: "collection-simplification-v2",
    version: 2,
    completedAt: { $type: "date" },
  });
  if (marker) return;
  for (const name of SOURCES) {
    if (await db.collection(name).findOne({}, { projection: { _id: 1 } })) {
      throw new Error(
        "Collection simplification migration required. Keep application writers stopped and follow docs/ops/collection-simplification-migration.md before starting this version.",
      );
    }
  }
}
