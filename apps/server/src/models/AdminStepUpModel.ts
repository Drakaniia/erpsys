import { COLLECTIONS, getDbSync } from "../lib/db/db.js";

export type AdminStepUpRow = {
  _id: string;
  pinAt: Date | null;
  passwordAt: Date | null;
  codeHash: string | null;
  sentAt: Date | null;
  attempts: number;
  codeAt: Date | null;
  totpAttempts: number;
  unlockedUntil: Date | null;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
};

export type AdminStepUpPatch = Partial<
  Omit<AdminStepUpRow, "_id" | "expiresAt" | "createdAt" | "updatedAt">
>;

function rows() {
  return getDbSync().collection<AdminStepUpRow>(COLLECTIONS.adminStepUp);
}

export class AdminStepUpModel {
  static async find(userId: string): Promise<AdminStepUpRow | null> {
    return rows().findOne({ _id: userId });
  }

  static async begin(
    userId: string,
    now: Date,
    expiresAt: Date,
    passwordAt: Date | null = null,
  ): Promise<void> {
    await rows().replaceOne(
      { _id: userId },
      {
        pinAt: now,
        passwordAt,
        codeHash: null,
        sentAt: null,
        attempts: 0,
        codeAt: null,
        totpAttempts: 0,
        unlockedUntil: null,
        expiresAt,
        createdAt: now,
        updatedAt: now,
      },
      { upsert: true },
    );
  }

  static async patch(
    userId: string,
    fields: AdminStepUpPatch,
    expiresAt: Date,
  ): Promise<void> {
    await rows().updateOne(
      { _id: userId },
      { $set: { ...fields, expiresAt, updatedAt: new Date() } },
    );
  }

  static async takeCodeAttempt(
    userId: string,
    max: number,
  ): Promise<AdminStepUpRow | null> {
    return rows().findOneAndUpdate(
      {
        _id: userId,
        codeHash: { $ne: null },
        codeAt: null,
        attempts: { $lt: max },
      },
      { $inc: { attempts: 1 }, $set: { updatedAt: new Date() } },
      { returnDocument: "after" },
    );
  }

  static async takeTotpAttempt(
    userId: string,
    max: number,
  ): Promise<AdminStepUpRow | null> {
    return rows().findOneAndUpdate(
      { _id: userId, codeAt: { $ne: null }, totpAttempts: { $lt: max } },
      { $inc: { totpAttempts: 1 }, $set: { updatedAt: new Date() } },
      { returnDocument: "after" },
    );
  }

  static async remove(userId: string): Promise<void> {
    await rows().deleteOne({ _id: userId });
  }
}
