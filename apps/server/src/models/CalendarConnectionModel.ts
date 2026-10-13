import { COLLECTIONS, getDbSync, refIn } from "../lib/db/db.js";
import { genId } from "../lib/db/ids.js";

export type ConnectionStatus = "PENDING" | "CONNECTED" | "NEEDS_RECONNECT";
export type ConnectionSyncState = "CLEAN" | "DIRTY" | "FAILED";

export type CalendarConnectionRow = {
  _id: string;
  userId: string;
  status: ConnectionStatus;
  pendingNonce?: string | null;
  refreshTokenEnc?: string;
  keyVersion?: number;
  scope?: string;
  googleEmail?: string | null;
  googleCalendarId?: string | null;
  syncState: ConnectionSyncState;
  attempts: number;
  nextAttemptAt?: Date | null;
  connectedAt?: Date | null;
  lastSyncAt?: Date | null;
  lastError?: string | null;
};

const rows = () =>
  getDbSync().collection<CalendarConnectionRow>(COLLECTIONS.calendarConnection);

export class CalendarConnectionModel {
  static async findByUser(
    userId: string,
  ): Promise<CalendarConnectionRow | null> {
    return rows().findOne({ userId } as never);
  }

  static async beginConnect(userId: string, nonce: string): Promise<void> {
    await rows().updateOne(
      { userId } as never,
      {
        $set: { userId, pendingNonce: nonce },
        $setOnInsert: {
          _id: genId("calendar"),
          status: "PENDING",
          syncState: "CLEAN",
          attempts: 0,
        },
      } as never,
      { upsert: true } as never,
    );
  }

  static async complete(
    userId: string,
    nonce: string,
    input: {
      refreshTokenEnc: string;
      scope: string;
      googleEmail: string | null;
      now: Date;
    },
  ): Promise<boolean> {
    const result = await rows().updateOne(
      { userId, pendingNonce: nonce } as never,
      {
        $set: {
          status: "CONNECTED",
          refreshTokenEnc: input.refreshTokenEnc,
          keyVersion: 1,
          scope: input.scope,
          googleEmail: input.googleEmail,
          connectedAt: input.now,
          syncState: "DIRTY",
          attempts: 0,
          nextAttemptAt: input.now,
          lastError: null,
          pendingNonce: null,
        },
      } as never,
    );
    return (result.matchedCount ?? 0) > 0;
  }

  static async markDirty(userId: string, now: Date): Promise<void> {
    await rows().updateOne(
      { userId, status: "CONNECTED" } as never,
      { $set: { syncState: "DIRTY", attempts: 0, nextAttemptAt: now } } as never,
    );
  }

  static async markSynced(
    userId: string,
    now: Date,
    calendarId: string,
  ): Promise<void> {
    await rows().updateOne(
      { userId } as never,
      {
        $set: {
          syncState: "CLEAN",
          attempts: 0,
          nextAttemptAt: null,
          lastSyncAt: now,
          lastError: null,
          googleCalendarId: calendarId,
        },
      } as never,
    );
  }

  static async markRetry(
    userId: string,
    input: {
      attempts: number;
      nextAttemptAt: Date | null;
      failed: boolean;
      error: string;
    },
  ): Promise<void> {
    await rows().updateOne(
      { userId } as never,
      {
        $set: {
          syncState: input.failed ? "FAILED" : "DIRTY",
          attempts: input.attempts,
          nextAttemptAt: input.nextAttemptAt,
          lastError: input.error,
        },
      } as never,
    );
  }

  static async markReconnect(userId: string): Promise<void> {
    await rows().updateOne(
      { userId } as never,
      {
        $set: {
          status: "NEEDS_RECONNECT",
          syncState: "CLEAN",
          nextAttemptAt: null,
          lastError: "revoked",
        },
      } as never,
    );
  }

  static async setCalendarId(
    userId: string,
    calendarId: string | null,
  ): Promise<void> {
    await rows().updateOne(
      { userId } as never,
      { $set: { googleCalendarId: calendarId } } as never,
    );
  }

  static async listDue(
    now: Date,
    limit: number,
  ): Promise<CalendarConnectionRow[]> {
    return rows()
      .find({
        status: "CONNECTED",
        syncState: "DIRTY",
        nextAttemptAt: { $lte: now },
      } as never)
      .limit(limit)
      .toArray();
  }

  static async remove(userId: string): Promise<void> {
    await rows().deleteMany({ userId: refIn([userId]) } as never);
  }
}
