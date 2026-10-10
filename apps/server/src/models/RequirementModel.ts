import { COLLECTIONS, getDbSync, idIn } from "../lib/db/db.js";

export type RequirementRow = {
  _id: string;
  label: string;
  order: number;
  isActive: boolean;
};

export class RequirementModel {
  static async list(): Promise<RequirementRow[]> {
    return getDbSync()
      .collection<RequirementRow>(COLLECTIONS.requirementItem)
      .find({} as never)
      .sort({ order: 1 })
      .toArray();
  }

  static async listActive(): Promise<RequirementRow[]> {
    return getDbSync()
      .collection<RequirementRow>(COLLECTIONS.requirementItem)
      .find({ isActive: true } as never)
      .sort({ order: 1 })
      .toArray();
  }

  static async findById(id: string): Promise<RequirementRow | null> {
    return getDbSync()
      .collection<RequirementRow>(COLLECTIONS.requirementItem)
      .findOne(idIn([id]) as never);
  }

  static async lastOrder(): Promise<number> {
    const rows = await getDbSync()
      .collection<RequirementRow>(COLLECTIONS.requirementItem)
      .find({} as never)
      .sort({ order: -1 })
      .limit(1)
      .toArray();
    return rows[0]?.order ?? 0;
  }

  static async insert(row: RequirementRow): Promise<void> {
    await getDbSync()
      .collection(COLLECTIONS.requirementItem)
      .insertOne(row as never);
  }

  static async update(
    id: string,
    patch: Partial<RequirementRow>,
  ): Promise<void> {
    await getDbSync()
      .collection(COLLECTIONS.requirementItem)
      .updateOne(idIn([id]) as never, { $set: patch } as never);
  }

  static async remove(id: string): Promise<void> {
    await getDbSync()
      .collection(COLLECTIONS.requirementItem)
      .deleteOne(idIn([id]) as never);
  }
}
