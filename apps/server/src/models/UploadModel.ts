import { COLLECTIONS, getDbSync, idIn } from "../lib/db/db.js";

export type UploadRow = {
  _id: string;
  fileKey?: string | null;
  fileUrl?: string | null;
  kind?: string;
  uploadedById?: string | null;
  studentProfileId?: string | null;
  sizeBytes?: number | null;
  mimeType?: string | null;
  createdAt?: Date | null;
  expiresAt?: Date | null;
  expiredAt?: Date | null;
  filePurgedAt?: Date | null;
  backend?: string | null;
  r2Status?: string | null;
  r2Bucket?: string | null;
  r2Key?: string | null;
  r2Route?: string | null;
  stepCode?: string | null;
  idempotencyKey?: string | null;
  sessionExpiresAt?: Date | null;
};

export function externalLinkKey(stepCode: string, url: string): string {
  return `external:${stepCode}:${url}`;
}

export class UploadModel {
  static async findById(id: string): Promise<UploadRow | null> {
    return getDbSync()
      .collection<UploadRow>(COLLECTIONS.upload)
      .findOne(idIn([id]) as never);
  }

  static async findForProfile(
    id: string,
    studentProfileId: string,
  ): Promise<UploadRow | null> {
    return getDbSync()
      .collection<UploadRow>(COLLECTIONS.upload)
      .findOne({ _id: id, studentProfileId } as never);
  }

  static async findByIds(ids: string[]): Promise<UploadRow[]> {
    if (ids.length === 0) return [];
    return getDbSync()
      .collection<UploadRow>(COLLECTIONS.upload)
      .find(idIn([...new Set(ids)]) as never)
      .sort({ createdAt: 1 })
      .toArray();
  }

  static async insert(row: UploadRow): Promise<void> {
    await getDbSync()
      .collection(COLLECTIONS.upload)
      .insertOne(row as never);
  }

  static async deleteById(id: string): Promise<void> {
    await getDbSync()
      .collection(COLLECTIONS.upload)
      .deleteOne(idIn([id]) as never);
  }

  static async deleteByIds(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    await getDbSync()
      .collection(COLLECTIONS.upload)
      .deleteMany(idIn(ids) as never);
  }

  static async listForProfileSince(
    studentProfileId: string,
    since: Date,
  ): Promise<UploadRow[]> {
    return getDbSync()
      .collection<UploadRow>(COLLECTIONS.upload)
      .find({ studentProfileId, createdAt: { $gte: since } } as never)
      .sort({ createdAt: 1 })
      .toArray();
  }

  static async listByProfileAndKind(
    studentProfileId: string,
    kind: string,
  ): Promise<UploadRow[]> {
    return getDbSync()
      .collection<UploadRow>(COLLECTIONS.upload)
      .find({ studentProfileId, kind } as never)
      .sort({ createdAt: 1 })
      .toArray();
  }

  static async listExternalLinks(
    studentProfileId: string,
  ): Promise<UploadRow[]> {
    return getDbSync()
      .collection<UploadRow>(COLLECTIONS.upload)
      .find({ studentProfileId, kind: "EXTERNAL_LINK" } as never)
      .toArray();
  }

  static async listExternalLinksForStep(
    studentProfileId: string,
    stepCode: string,
  ): Promise<UploadRow[]> {
    return getDbSync()
      .collection<UploadRow>(COLLECTIONS.upload)
      .find({
        studentProfileId,
        kind: "EXTERNAL_LINK",
        fileKey: { $regex: `^external:${stepCode}:` },
      } as never)
      .toArray();
  }

  static async upsertExternalLink(input: {
    studentProfileId: string;
    fileKey: string;
    fileUrl: string;
    uploadedById: string;
    now: Date;
  }): Promise<void> {
    await getDbSync()
      .collection(COLLECTIONS.upload)
      .updateOne(
        {
          studentProfileId: input.studentProfileId,
          fileKey: input.fileKey,
        } as never,
        {
          $set: {
            studentProfileId: input.studentProfileId,
            fileKey: input.fileKey,
            fileUrl: input.fileUrl,
            kind: "EXTERNAL_LINK",
            uploadedById: input.uploadedById,
            createdAt: input.now,
          },
          $setOnInsert: { _id: `upload-${crypto.randomUUID()}` },
        } as never,
        { upsert: true } as never,
      );
  }

  static async updateById(
    id: string,
    patch: Record<string, unknown>,
  ): Promise<void> {
    await getDbSync()
      .collection(COLLECTIONS.upload)
      .updateOne(idIn([id]) as never, { $set: patch } as never);
  }

  static async listDraftCandidates(
    studentProfileId: string,
    kinds: readonly string[],
  ): Promise<UploadRow[]> {
    return getDbSync()
      .collection<UploadRow>(COLLECTIONS.upload)
      .find({
        studentProfileId,
        kind: { $in: [...kinds] },
        $or: [{ expiredAt: null }, { filePurgedAt: null }],
      } as never)
      .toArray();
  }

  static async updateManyByIds(
    ids: string[],
    patch: Partial<UploadRow>,
  ): Promise<void> {
    if (ids.length === 0) return;
    await getDbSync()
      .collection(COLLECTIONS.upload)
      .updateMany(idIn(ids) as never, { $set: patch } as never);
  }

  static async listStepEvidence(
    studentProfileId: string,
    stepCode: string,
    kind: string,
    expired = false,
  ): Promise<UploadRow[]> {
    return getDbSync()
      .collection<UploadRow>(COLLECTIONS.upload)
      .find({
        studentProfileId,
        $or: [
          { kind },
          {
            kind: "EXTERNAL_LINK",
            fileKey: { $regex: `^external:${stepCode}:` },
          },
        ],
        expiredAt: expired ? { $ne: null } : null,
      } as never)
      .sort({ createdAt: 1 })
      .toArray();
  }

  static async countStepEvidence(
    studentProfileId: string,
    stepCode: string,
    kind: string,
    expired = false,
  ): Promise<number> {
    return getDbSync()
      .collection(COLLECTIONS.upload)
      .countDocuments({
        studentProfileId,
        $or: [
          { kind },
          {
            kind: "EXTERNAL_LINK",
            fileKey: { $regex: `^external:${stepCode}:` },
          },
        ],
        expiredAt: expired ? { $ne: null } : null,
      } as never);
  }
}
