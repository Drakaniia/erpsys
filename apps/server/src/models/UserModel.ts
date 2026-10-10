import { COLLECTIONS, getDbSync, idIn } from "../lib/db/db.js";

export type UserRow = {
  _id: string;
  name?: string | null;
  email?: string;
  image?: string | null;
  role?: string;
  isOutsideOrg?: boolean;
  blockedAt?: Date | null;
  createdAt?: Date | null;
  stampName?: string | null;
  stampGraphicUrl?: string | null;
  stampSignatureUrl?: string | null;
};

export class UserModel {
  static async findById(id: string): Promise<UserRow | null> {
    return getDbSync()
      .collection<UserRow>(COLLECTIONS.user)
      .findOne(idIn([id]) as never, {
        projection: {
          _id: 1,
          name: 1,
          email: 1,
          role: 1,
          isOutsideOrg: 1,
          blockedAt: 1,
        },
      });
  }

  static async findByEmail(email: string): Promise<UserRow | null> {
    return getDbSync()
      .collection<UserRow>(COLLECTIONS.user)
      .findOne(
        { email: email.trim().toLowerCase() } as never,
        { projection: { _id: 1, name: 1, email: 1, role: 1 } },
      );
  }

  static async findByIds(ids: string[]): Promise<UserRow[]> {
    if (ids.length === 0) return [];
    return getDbSync()
      .collection<UserRow>(COLLECTIONS.user)
      .find(idIn([...new Set(ids)]) as never)
      .toArray();
  }

  static async searchByName(
    pattern: { $regex: string; $options: string },
    limit = 500,
  ): Promise<Array<{ _id: string }>> {
    return getDbSync()
      .collection<UserRow>(COLLECTIONS.user)
      .find({ $or: [{ name: pattern }, { email: pattern }] } as never, {
        projection: { _id: 1 },
      })
      .limit(limit)
      .toArray();
  }

  static async listForDirectory(
    filter: Record<string, unknown>,
    dir: "asc" | "desc",
    paging?: { page: number; pageSize: number },
  ): Promise<UserRow[]> {
    let query = getDbSync()
      .collection<UserRow>(COLLECTIONS.user)
      .find(filter as never)
      .sort({ createdAt: dir === "asc" ? 1 : -1 });
    if (paging) {
      query = query
        .skip((paging.page - 1) * paging.pageSize)
        .limit(paging.pageSize);
    }
    return query.toArray();
  }

  static async countForDirectory(
    filter: Record<string, unknown>,
  ): Promise<number> {
    return getDbSync()
      .collection<UserRow>(COLLECTIONS.user)
      .countDocuments(filter as never);
  }

  static async listByRole(role: string): Promise<UserRow[]> {
    return getDbSync()
      .collection<UserRow>(COLLECTIONS.user)
      .find({ role } as never, { projection: { name: 1, email: 1, role: 1 } })
      .sort({ name: 1 })
      .toArray();
  }

  static async listActiveRoles(): Promise<Array<{ role?: string }>> {
    return getDbSync()
      .collection<UserRow>(COLLECTIONS.user)
      .find({ blockedAt: null } as never, { projection: { role: 1 } })
      .toArray();
  }

  static async patchById(
    id: string,
    patch: Record<string, string | null>,
  ): Promise<boolean> {
    const result = await getDbSync()
      .collection<UserRow>(COLLECTIONS.user)
      .updateOne(idIn([id]) as never, { $set: patch } as never);
    return result.matchedCount > 0;
  }

  static async promoteToAdmin(id: string): Promise<void> {
    await getDbSync()
      .collection(COLLECTIONS.user)
      .updateOne(
        idIn([id]) as never,
        {
          $set: { role: "ADMIN", isOutsideOrg: false },
        } as never,
      );
  }
}
