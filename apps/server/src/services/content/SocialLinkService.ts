import { ApiError } from "../../config/errors.js";
import { COLLECTIONS, getDbSync, idIn } from "../../lib/db/db.js";
import { genId } from "../../lib/db/ids.js";

export type SocialLinkRow = {
  _id: string;
  name: string;
  url: string;
  order: number;
};

export type SocialLinkView = {
  id: string;
  name: string;
  url: string;
  order: number;
};

const NOT_FOUND = "That link no longer exists.";

const toView = (row: SocialLinkRow): SocialLinkView => ({
  id: String(row._id),
  name: row.name,
  url: row.url,
  order: row.order,
});

const links = () =>
  getDbSync().collection<SocialLinkRow>(COLLECTIONS.socialMediaLink);

export class SocialLinkService {
  static async list(): Promise<SocialLinkView[]> {
    const rows = await links()
      .find({ isActive: true } as never)
      .sort({ order: 1 })
      .toArray();
    return rows.map(toView);
  }

  static async save(input: {
    id?: string;
    name: string;
    url: string;
  }): Promise<SocialLinkView> {
    if (input.id) {
      const existing = await links().findOne(idIn([input.id]) as never);
      if (!existing) throw new ApiError("NOT_FOUND", { message: NOT_FOUND });
      const updated = { ...existing, name: input.name, url: input.url };
      await links().updateOne(
        idIn([input.id]) as never,
        {
          $set: { name: input.name, url: input.url },
        } as never,
      );
      return toView(updated);
    }

    const highest = await links()
      .find({} as never)
      .sort({ order: -1 })
      .limit(1)
      .toArray();
    const row: SocialLinkRow = {
      _id: genId("sml"),
      name: input.name,
      url: input.url,
      order: (highest[0]?.order ?? 0) + 1,
    };
    await links().insertOne({
      ...row,
      isActive: true,
      createdAt: new Date(),
    } as never);
    return toView(row);
  }

  static async update(
    id: string,
    input: { name: string; url: string },
  ): Promise<SocialLinkView> {
    const existing = await links().findOne(idIn([id]) as never);
    if (!existing) throw new ApiError("NOT_FOUND", { message: NOT_FOUND });
    await links().updateOne(
      idIn([id]) as never,
      {
        $set: { name: input.name, url: input.url },
      } as never,
    );
    return toView({ ...existing, name: input.name, url: input.url });
  }

  static async remove(id: string): Promise<void> {
    await links().deleteOne(idIn([id]) as never);
  }

  static async reorder(orderedIds: string[]): Promise<void> {
    await Promise.all(
      orderedIds.map((id, index) =>
        links().updateOne(
          idIn([id]) as never,
          {
            $set: { order: index + 1 },
          } as never,
        ),
      ),
    );
  }
}
