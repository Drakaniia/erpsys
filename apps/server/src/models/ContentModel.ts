import { COLLECTIONS, getDbSync, idIn } from "../lib/db/db.js";

export type RequirementRow = {
  _id: string;
  label: string;
  order: number;
  isActive: boolean;
  createdAt?: Date | null;
  updatedAt?: Date | null;
};

export type SocialLinkRow = {
  _id: string;
  name: string;
  url: string;
  order: number;
  isActive: boolean;
  createdAt?: Date | null;
  updatedAt?: Date | null;
};

export class ContentModel {
  static async list(): Promise<RequirementRow[]> {
    return getDbSync()
      .collection<RequirementRow>(COLLECTIONS.content)
      .find({ kind: "requirement" } as never)
      .sort({ order: 1 })
      .toArray();
  }

  static async listActive(): Promise<RequirementRow[]> {
    return getDbSync()
      .collection<RequirementRow>(COLLECTIONS.content)
      .find({ kind: "requirement", isActive: true } as never)
      .sort({ order: 1 })
      .toArray();
  }

  static async findById(id: string): Promise<RequirementRow | null> {
    return getDbSync()
      .collection<RequirementRow>(COLLECTIONS.content)
      .findOne({ ...idIn([id]), kind: "requirement" } as never);
  }

  static async lastOrder(): Promise<number> {
    const rows = await getDbSync()
      .collection<RequirementRow>(COLLECTIONS.content)
      .find({ kind: "requirement" } as never)
      .sort({ order: -1 })
      .limit(1)
      .toArray();
    return rows[0]?.order ?? 0;
  }

  static async insert(row: RequirementRow): Promise<void> {
    await getDbSync()
      .collection(COLLECTIONS.content)
      .insertOne({ ...row, kind: "requirement" } as never);
  }

  static async update(
    id: string,
    patch: Partial<RequirementRow>,
  ): Promise<void> {
    await getDbSync()
      .collection(COLLECTIONS.content)
      .updateOne(
        { ...idIn([id]), kind: "requirement" } as never,
        { $set: { ...patch, kind: "requirement" } } as never,
      );
  }

  static async remove(id: string): Promise<void> {
    await getDbSync()
      .collection(COLLECTIONS.content)
      .deleteOne({ ...idIn([id]), kind: "requirement" } as never);
  }

  static async listActiveSocialLinks(): Promise<SocialLinkRow[]> {
    return getDbSync()
      .collection<SocialLinkRow>(COLLECTIONS.content)
      .find({ kind: "socialLink", isActive: true } as never)
      .sort({ order: 1 })
      .toArray();
  }
}
