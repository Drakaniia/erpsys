import { randomUUID } from "node:crypto";
import { COLLECTIONS, getDbSync } from "../lib/db/db.js";
import { ApiError } from "../config/errors.js";

export type Editor = {
  userId: string;
  editorId: string;
  name: string;
  lastSeenAt: Date;
  expiresAt: Date;
};
export type EditingPresence = {
  _id: string;
  resource: string;
  recordId: string;
  revision: string;
  editors: Editor[];
  updatedAt: Date;
};

const collection = () => getDbSync().collection<EditingPresence>(COLLECTIONS.editingPresence);
const key = (resource: string, recordId: string) => `${resource}:${recordId}`;
export const activeEditors = (editors: Editor[], now = new Date()) =>
  editors.filter((editor) => new Date(editor.expiresAt).getTime() > now.getTime());

export async function readPresence(resource: string, recordId: string) {
  const row = await collection().findOne({ _id: key(resource, recordId) });
  return { resource, recordId, editors: activeEditors(row?.editors ?? []) };
}

export async function changePresence(
  resource: string,
  recordId: string,
  userId: string,
  editorId: string,
  name?: string,
) {
  const _id = key(resource, recordId);
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (name !== undefined) {
      try {
        await collection().updateOne({ _id }, { $setOnInsert: {
          _id, resource, recordId, revision: randomUUID(), editors: [], updatedAt: new Date(),
        } }, { upsert: true });
      } catch (error) {
        if ((error as { code?: number }).code !== 11000) throw error;
      }
    }
    const row = await collection().findOne({ _id });
    if (!row) {
      if (name !== undefined) continue;
      return { resource, recordId, editors: [] };
    }
    const now = new Date();
    const editors = activeEditors(row.editors, now).filter(
      (editor) => editor.userId !== userId || editor.editorId !== editorId,
    );
    if (name !== undefined) editors.push({
      userId, editorId, name, lastSeenAt: now, expiresAt: new Date(now.getTime() + 60_000),
    });
    const result = await collection().updateOne(
      { _id, revision: row.revision },
      { $set: { editors, updatedAt: now, revision: randomUUID() } },
    );
    if (result.matchedCount) return { resource, recordId, editors };
  }
  throw new ApiError("CONFLICT", { message: "Editor presence is busy. Try again shortly." });
}

export async function listPresence(page: number, pageSize: number) {
  const filter = { editors: { $elemMatch: { expiresAt: { $gt: new Date() } } } };
  const [rows, total] = await Promise.all([
    collection().find(filter).sort({ updatedAt: -1 }).skip((page - 1) * pageSize).limit(pageSize).toArray(),
    collection().countDocuments(filter),
  ]);
  return { rows: rows.map((row) => ({
    resource: row.resource, recordId: row.recordId, editors: activeEditors(row.editors),
  })), total };
}


