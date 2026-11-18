import { randomUUID } from "node:crypto";
import type { Db } from "mongodb";

type PresenceRow = { _id: string; revision: string; editors: { expiresAt: Date }[] };

export async function sweepPresence(db: Db) {
  const collection = db.collection<PresenceRow>("editing_presence");
  const now = new Date();
  const rows = await collection.find({ editors: { $elemMatch: { expiresAt: { $lte: now } } } }).toArray();
  for (const row of rows) {
    await collection.updateOne(
      { _id: row._id, revision: row.revision },
      { $set: { editors: row.editors.filter((editor) => new Date(editor.expiresAt) > now), revision: randomUUID() } },
    );
  }
  await collection.deleteMany({ editors: { $size: 0 } });
}
