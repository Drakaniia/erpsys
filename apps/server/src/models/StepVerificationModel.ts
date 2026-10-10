import { COLLECTIONS, getDbSync, idIn } from "../lib/db/db.js";

export type StepVerificationRow = {
  _id: string;
  studentProfileId: string;
  stepId: string;
  academicYearId: string;
  status?: string | null;
  appliedAt?: Date | null;
  createdAt?: Date | null;
  verifiedAt?: Date | null;
  verifiedById?: string | null;
  respondedAt?: Date | null;
  respondedById?: string | null;
  revokedById?: string | null;
  revokedAt?: Date | null;
  replyChips?: unknown;
  replyNote?: string | null;
  evidence?: unknown;
  evidenceCount?: number;
  answers?: { label: string; value: string }[];
};

export type StepKey = {
  studentProfileId: string;
  stepId: string;
  academicYearId: string;
};

export class StepVerificationModel {
  static async findByStep(step: StepKey): Promise<StepVerificationRow | null> {
    return getDbSync()
      .collection<StepVerificationRow>(COLLECTIONS.stepVerification)
      .findOne(step as never);
  }

  static async listByProfileYear(
    studentProfileId: string,
    academicYearId: string,
  ): Promise<StepVerificationRow[]> {
    return getDbSync()
      .collection<StepVerificationRow>(COLLECTIONS.stepVerification)
      .find({ studentProfileId, academicYearId } as never)
      .toArray();
  }

  static async listByProfiles(
    studentProfileIds: string[],
    academicYearId: string,
  ): Promise<StepVerificationRow[]> {
    if (studentProfileIds.length === 0) return [];
    return getDbSync()
      .collection<StepVerificationRow>(COLLECTIONS.stepVerification)
      .find(
        {
          academicYearId,
          studentProfileId: { $in: [...new Set(studentProfileIds)] },
        } as never,
        { projection: { studentProfileId: 1, stepId: 1, status: 1 } },
      )
      .toArray();
  }

  static async listEvidenceByProfile(
    studentProfileId: string,
  ): Promise<{ evidence?: unknown }[]> {
    return getDbSync()
      .collection<StepVerificationRow>(COLLECTIONS.stepVerification)
      .find({ studentProfileId } as never, { projection: { evidence: 1 } })
      .toArray();
  }

  static async search(
    where: Record<string, unknown>,
    sortSpec: Record<string, 1 | -1>,
    skip: number,
    limit: number,
  ): Promise<StepVerificationRow[]> {
    return getDbSync()
      .collection<StepVerificationRow>(COLLECTIONS.stepVerification)
      .find(where as never)
      .sort(sortSpec)
      .skip(skip)
      .limit(limit)
      .toArray();
  }

  static async listStepIdsByStatus(
    academicYearId: string,
    status: string | { $ne: string },
  ): Promise<Array<{ stepId: string }>> {
    return getDbSync()
      .collection<StepVerificationRow>(COLLECTIONS.stepVerification)
      .find({ academicYearId, status } as never, { projection: { stepId: 1 } })
      .toArray();
  }

  static async listTimelineForYear(
    academicYearId: string,
    stepIds: string[],
  ): Promise<
    Array<
      Pick<
        StepVerificationRow,
        | "studentProfileId"
        | "stepId"
        | "status"
        | "appliedAt"
        | "createdAt"
        | "verifiedAt"
        | "respondedAt"
      >
    >
  > {
    if (stepIds.length === 0) return [];
    return getDbSync()
      .collection<StepVerificationRow>(COLLECTIONS.stepVerification)
      .find(
        { academicYearId, stepId: { $in: stepIds } } as never,
        {
          projection: {
            studentProfileId: 1,
            stepId: 1,
            status: 1,
            appliedAt: 1,
            createdAt: 1,
            verifiedAt: 1,
            respondedAt: 1,
          },
        },
      )
      .toArray();
  }

  static async countWhere(where: Record<string, unknown>): Promise<number> {
    return getDbSync()
      .collection<StepVerificationRow>(COLLECTIONS.stepVerification)
      .countDocuments(where as never);
  }

  static async insert(row: StepVerificationRow): Promise<void> {
    await getDbSync()
      .collection(COLLECTIONS.stepVerification)
      .insertOne(row as never);
  }

  static async updateById(
    id: string,
    patch: Partial<StepVerificationRow>,
  ): Promise<void> {
    await getDbSync()
      .collection(COLLECTIONS.stepVerification)
      .updateOne(idIn([id]) as never, { $set: patch } as never);
  }

  static async updateEvidenceIfNotVerified(
    id: string,
    uploadIds: string[],
    patch: Partial<StepVerificationRow> = {},
  ): Promise<boolean> {
    const result = await getDbSync()
      .collection(COLLECTIONS.stepVerification)
      .updateOne(
        { _id: id, status: { $ne: "VERIFIED" } } as never,
        {
          $set: {
            ...patch,
            evidence: { uploadIds },
            evidenceCount: uploadIds.length,
          },
        } as never,
      );
    return result.matchedCount > 0;
  }

  static async deleteById(id: string): Promise<void> {
    await getDbSync()
      .collection(COLLECTIONS.stepVerification)
      .deleteOne(idIn([id]) as never);
  }

  static async deleteIfNotVerified(id: string): Promise<void> {
    await getDbSync()
      .collection(COLLECTIONS.stepVerification)
      .deleteOne({ _id: id, status: { $ne: "VERIFIED" } } as never);
  }

  static async verify(
    studentProfileId: string,
    stepId: string,
    academicYearId: string,
    verifiedById: string,
    now: Date,
  ): Promise<void> {
    await getDbSync()
      .collection(COLLECTIONS.stepVerification)
      .updateOne(
        { studentProfileId, stepId, academicYearId } as never,
        {
          $set: {
            studentProfileId,
            stepId,
            academicYearId,
            status: "VERIFIED",
            verifiedById,
            verifiedAt: now,
          },
          $setOnInsert: {
            _id: `verification-${crypto.randomUUID()}`,
            createdAt: now,
            appliedAt: now,
          },
        } as never,
        { upsert: true } as never,
      );
  }

  static async revoke(
    studentProfileId: string,
    stepId: string,
    academicYearId: string,
    revokedById: string,
    now: Date,
    clearAppliedAt = false,
  ): Promise<void> {
    await getDbSync()
      .collection(COLLECTIONS.stepVerification)
      .updateMany(
        { studentProfileId, stepId, academicYearId } as never,
        {
          $set: { status: "PENDING", revokedById, revokedAt: now },
          ...(clearAppliedAt ? { $unset: { appliedAt: "" } } : {}),
        } as never,
      );
  }

  static async findById(id: string): Promise<StepVerificationRow | null> {
    return getDbSync()
      .collection<StepVerificationRow>(COLLECTIONS.stepVerification)
      .findOne(idIn([id]) as never);
  }

  static async upsertSubmission(
    step: StepKey,
    uploadIds: string[],
    now: Date,
    answers?: { label: string; value: string }[],
  ): Promise<void> {
    await getDbSync()
      .collection(COLLECTIONS.stepVerification)
      .updateOne(
        step as never,
        {
          $set: {
            ...step,
            status: "SUBMITTED",
            evidence: { uploadIds },
            evidenceCount: uploadIds.length,
            ...(answers ? { answers } : {}),
          },
          $setOnInsert: {
            _id: `verification-${crypto.randomUUID()}`,
            createdAt: now,
            appliedAt: now,
          },
        } as never,
        { upsert: true } as never,
      );
  }
}
