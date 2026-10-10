import { COLLECTIONS, getDbSync } from "../lib/db/db.js";

export type StepRow = {
  _id: string;
  code: string;
  name: string;
  order: number;
};

export class StepModel {
  static async listOrdered(): Promise<StepRow[]> {
    return getDbSync()
      .collection<StepRow>(COLLECTIONS.step)
      .find({} as never)
      .sort({ order: 1 })
      .toArray();
  }

  static async findById(id: string): Promise<StepRow | null> {
    return getDbSync()
      .collection<StepRow>(COLLECTIONS.step)
      .findOne({ _id: id } as never);
  }

  static async findByCode(code: string): Promise<StepRow | null> {
    return getDbSync()
      .collection<StepRow>(COLLECTIONS.step)
      .findOne({ code } as never);
  }

  static async listCodeMap(): Promise<Array<{ _id: string; code: string }>> {
    return getDbSync()
      .collection<StepRow>(COLLECTIONS.step)
      .find({} as never, { projection: { code: 1 } })
      .toArray();
  }

  static async listByCodes(codes: string[]): Promise<StepRow[]> {
    if (codes.length === 0) return [];
    return getDbSync()
      .collection<StepRow>(COLLECTIONS.step)
      .find({ code: { $in: codes } } as never)
      .sort({ order: 1 })
      .toArray();
  }
}
