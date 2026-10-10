import { COLLECTIONS, getDbSync, refIn } from "../lib/db/db.js";

export type AccountRow = {
  _id: string;
  userId: string;
  providerId: string;
  password?: string | null;
};

export class AccountModel {
  static async hasPassword(userId: string): Promise<boolean> {
    const rows = await getDbSync()
      .collection<AccountRow>(COLLECTIONS.account)
      .find(
        { userId: refIn([userId]), providerId: "credential" } as never,
        { projection: { password: 1 } },
      )
      .toArray();
    return rows.some((row) => !!row.password);
  }
}
