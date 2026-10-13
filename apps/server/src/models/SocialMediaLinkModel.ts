import { COLLECTIONS, getDbSync } from "../lib/db/db.js";

export type SocialLinkRow = {
  _id: string;
  name: string;
  url: string;
  order: number;
  isActive: boolean;
};

export class SocialMediaLinkModel {
  static async listActive(): Promise<SocialLinkRow[]> {
    return getDbSync()
      .collection<SocialLinkRow>(COLLECTIONS.socialMediaLink)
      .find({ isActive: true } as never)
      .sort({ order: 1 })
      .toArray();
  }
}
