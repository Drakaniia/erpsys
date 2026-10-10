import { invalidateKnowledgeCache } from "../../lib/chat/knowledge.js";
import { COLLECTIONS, getDbSync, idIn } from "../../lib/db/db.js";
import { genId } from "../../lib/db/ids.js";
import { AdminActionLogModel } from "../../models/AdminActionLogModel.js";

type KnowledgeDoc = {
  _id: string;
  content: string;
  version: number;
  updatedById?: string;
  updatedAt: Date;
};

export type KnowledgeView = {
  content: string;
  version: number;
  updatedById: string | null;
  updatedByName: string | null;
  updatedAt: string;
} | null;

const db = () => getDbSync();
const knowledge = () =>
  db().collection<KnowledgeDoc>(COLLECTIONS.chatbotKnowledge);

async function latest(): Promise<KnowledgeDoc | null> {
  const docs = await knowledge()
    .find({} as never)
    .sort({ updatedAt: -1 })
    .limit(1)
    .toArray();
  return docs[0] ?? null;
}

export class ChatbotKnowledgeService {
  static async read(): Promise<KnowledgeView> {
    const doc = await latest();
    if (!doc) return null;
    const updater = doc.updatedById
      ? await db()
          .collection<{ _id: string; name: string }>(COLLECTIONS.user)
          .findOne(idIn([doc.updatedById]) as never)
      : null;
    return {
      content: doc.content,
      version: doc.version,
      updatedById: updater ? String(updater._id) : null,
      updatedByName: updater?.name ?? null,
      updatedAt: new Date(doc.updatedAt).toISOString(),
    };
  }

  static async write(
    actorId: string,
    content: string,
  ): Promise<{ version: number; updatedAt: string }> {
    const existing = await latest();
    const updatedAt = new Date();
    let version = 1;

    if (existing) {
      version = existing.version + 1;
      await knowledge().updateOne(
        { _id: existing._id } as never,
        {
          $set: { content, version, updatedById: actorId, updatedAt },
        } as never,
      );
    } else {
      await knowledge().insertOne({
        _id: genId("knowledge"),
        content,
        version,
        updatedById: actorId,
        updatedAt,
        createdAt: updatedAt,
      } as never);
    }

    invalidateKnowledgeCache();
    await AdminActionLogModel.log(
      actorId,
      "Updated chatbot doc",
      `v${version}`,
    );
    return { version, updatedAt: updatedAt.toISOString() };
  }
}
