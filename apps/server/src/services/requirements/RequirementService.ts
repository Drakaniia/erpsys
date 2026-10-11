import { ApiError } from "../../config/errors.js";
import { genId } from "../../lib/db/ids.js";
import { AdminActionLogModel } from "../../models/AdminActionLogModel.js";
import { RequirementModel } from "../../models/RequirementModel.js";

export type RequirementView = {
  id: string;
  label: string;
  order: number;
  isActive: boolean;
};

const toView = (row: {
  _id: string;
  label: string;
  order: number;
  isActive: boolean;
}): RequirementView => ({
  id: String(row._id),
  label: row.label,
  order: row.order,
  isActive: row.isActive,
});

const NOT_FOUND = "Requirement not found.";

export class RequirementService {
  static async list(): Promise<RequirementView[]> {
    return (await RequirementModel.list()).map(toView);
  }

  static async create(
    actorId: string,
    input: { label: string },
  ): Promise<RequirementView> {
    const row = {
      _id: genId("req"),
      label: input.label,
      order: (await RequirementModel.lastOrder()) + 1,
      isActive: true,
    };
    await RequirementModel.insert(row);
    await AdminActionLogModel.log(actorId, "Added requirement", input.label);
    return toView(row);
  }

  static async update(
    actorId: string,
    id: string,
    input: { label?: string; isActive?: boolean },
  ): Promise<RequirementView> {
    const existing = await RequirementModel.findById(id);
    if (!existing) throw new ApiError("NOT_FOUND", { message: NOT_FOUND });

    const patch: Partial<typeof existing> = {};
    if (input.label !== undefined) patch.label = input.label;
    if (input.isActive !== undefined) patch.isActive = input.isActive;
    if (Object.keys(patch).length > 0) await RequirementModel.update(id, patch);

    const updated = { ...existing, ...patch };
    await AdminActionLogModel.log(
      actorId,
      "Updated requirement",
      String(updated.label),
    );
    return toView(updated);
  }

  static async remove(actorId: string, id: string): Promise<{ id: string }> {
    const existing = await RequirementModel.findById(id);
    if (!existing) throw new ApiError("NOT_FOUND", { message: NOT_FOUND });

    await RequirementModel.remove(id);
    await AdminActionLogModel.log(
      actorId,
      "Deleted requirement",
      existing.label,
    );
    return { id };
  }

  static async reorder(
    actorId: string,
    orderedIds: string[],
  ): Promise<{ orderedIds: string[] }> {
    const items = await RequirementModel.list();
    const known = new Set(items.map((item) => String(item._id)));
    if (orderedIds.some((id) => !known.has(id))) {
      throw new ApiError("NOT_FOUND", { message: NOT_FOUND });
    }

    const listed = new Set(orderedIds);
    const finalIds = [
      ...orderedIds,
      ...items.map((item) => String(item._id)).filter((id) => !listed.has(id)),
    ];
    for (const [index, id] of finalIds.entries()) {
      await RequirementModel.update(id, { order: index });
    }

    await AdminActionLogModel.log(
      actorId,
      "Reordered requirements",
      `${orderedIds.length} item(s)`,
    );
    return { orderedIds };
  }
}
