import { COLLECTIONS, getDbSync, idIn } from "../lib/db/db.js";
import type { TransferRow } from "../config/transfers.js";

export class DepartmentTransferModel {
  static async findById(id: string): Promise<TransferRow | null> {
    return getDbSync()
      .collection<TransferRow>(COLLECTIONS.departmentTransferRequest)
      .findOne(idIn([id]) as never);
  }

  static async insert(row: TransferRow): Promise<void> {
    await getDbSync()
      .collection<TransferRow>(COLLECTIONS.departmentTransferRequest)
      .insertOne(row as never);
  }

  static async update(id: string, patch: Partial<TransferRow>): Promise<void> {
    await getDbSync()
      .collection(COLLECTIONS.departmentTransferRequest)
      .updateOne(idIn([id]) as never, { $set: patch } as never);
  }

  static async listIncoming(userId: string): Promise<TransferRow[]> {
    return getDbSync()
      .collection<TransferRow>(COLLECTIONS.departmentTransferRequest)
      .find({ ownerId: userId, status: "PENDING" } as never)
      .sort({ createdAt: -1 })
      .limit(20)
      .toArray();
  }

  static async listOutgoing(userId: string): Promise<TransferRow[]> {
    return getDbSync()
      .collection<TransferRow>(COLLECTIONS.departmentTransferRequest)
      .find({ requesterId: userId } as never)
      .sort({ createdAt: -1 })
      .limit(20)
      .toArray();
  }

  static async deletePending(
    departmentId: string,
    requesterId: string,
  ): Promise<void> {
    await getDbSync()
      .collection(COLLECTIONS.departmentTransferRequest)
      .deleteMany({
        departmentId,
        requesterId,
        status: "PENDING",
      } as never);
  }

  static async listExpired(now: Date): Promise<TransferRow[]> {
    return getDbSync()
      .collection<TransferRow>(COLLECTIONS.departmentTransferRequest)
      .find({ status: "PENDING", expiresAt: { $lte: now } } as never)
      .sort({ expiresAt: 1 })
      .toArray();
  }

  static async cancelPendingExcept(
    departmentId: string,
    exceptId: string,
    now: Date,
  ): Promise<void> {
    await getDbSync()
      .collection(COLLECTIONS.departmentTransferRequest)
      .updateMany(
        { departmentId, status: "PENDING", _id: { $ne: exceptId } } as never,
        { $set: { status: "CANCELLED", resolvedAt: now } } as never,
      );
  }
}
