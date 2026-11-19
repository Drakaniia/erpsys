import { Router } from "express";
import { z } from "zod";
import { ApiError } from "../../config/errors.js";
import { genId } from "../../lib/db/ids.js";
import {
  requireSession,
  requireSurface,
  sessionUser,
} from "../../middleware/auth.js";
import { catchAsync } from "../../middleware/catchAsync.js";
import {
  okList,
  okOne,
  parseBody,
  parsePagination,
  parseQuery,
} from "../../middleware/http.js";
import { AdminActionLogModel } from "../../models/AdminActionLogModel.js";
import {
  ContentModel,
  type RequirementRow,
} from "../../models/ContentModel.js";

/**
 * `/api/v1` — the enrollment requirement list; admin-only.
 */
export const requirementsRouter = Router();

const admin = [requireSession, requireSurface("admin")];
const idParams = z.object({ id: z.string().min(1) });
const label = z.string().trim().min(1).max(200);
const notFound = () =>
  new ApiError("NOT_FOUND", { message: "Requirement not found." });

const toView = (row: RequirementRow) => ({
  id: String(row._id),
  label: row.label,
  order: row.order,
  isActive: row.isActive,
});

async function findOrThrow(id: string): Promise<RequirementRow> {
  const row = await ContentModel.findById(id);
  if (!row) throw notFound();
  return row;
}

/**
 * `GET /api/v1/requirements`
 * Access: session + admin surface.
 * Use: list requirement rows (query `page`, `pageSize`).
 * Returns: `{ data, page, pageSize, total }`.
 */
requirementsRouter.get(
  "/requirements",
  admin,
  catchAsync(async (req, res) => {
    const items = (await ContentModel.list()).map(toView);
    const { page, pageSize } = parsePagination(req);
    okList(res, items, page, pageSize, items.length);
  }),
);

/**
 * `POST /api/v1/requirements`
 * Access: session + admin surface.
 * Concurrency: timestamp ordering — optional body `ts`; stale → `409` `TS_ABORTED`.
 * Use: add one — body `{ label }`.
 * Returns: `201` with `{ data: row }`.
 */
requirementsRouter.post(
  "/requirements",
  admin,
  catchAsync(async (req, res) => {
    const input = parseBody(z.object({ label }), req);
    const row = {
      _id: genId("req"),
      label: input.label,
      order: (await ContentModel.lastOrder()) + 1,
      isActive: true,
    };
    await ContentModel.insert(row);
    await AdminActionLogModel.log(
      sessionUser(req).id,
      "Added requirement",
      input.label,
    );
    okOne(res, toView(row), 201);
  }),
);

/**
 * `PUT /api/v1/requirements/order`
 * Access: session + admin surface.
 * Concurrency: timestamp ordering — optional body `ts`; stale → `409` `TS_ABORTED`.
 * Use: reorder — body `{ orderedIds }`; literal path, so it never falls to
 * `/:id`.
 * Returns: `{ data: rows }` in the new order.
 */
requirementsRouter.put(
  "/requirements/order",
  admin,
  catchAsync(async (req, res) => {
    const { orderedIds } = parseBody(
      z.object({ orderedIds: z.array(z.string().min(1)).max(500) }),
      req,
    );
    const ids = (await ContentModel.list()).map((item) => String(item._id));
    if (orderedIds.some((id) => !ids.includes(id))) throw notFound();
    const finalIds = [
      ...orderedIds,
      ...ids.filter((id) => !orderedIds.includes(id)),
    ];
    for (const [index, id] of finalIds.entries()) {
      await ContentModel.update(id, { order: index });
    }
    await AdminActionLogModel.log(
      sessionUser(req).id,
      "Reordered requirements",
      `${orderedIds.length} item(s)`,
    );
    okOne(res, { orderedIds });
  }),
);

/**
 * `PATCH /api/v1/requirements/:id`
 * Access: session + admin surface.
 * Concurrency: timestamp ordering — optional body `ts`; stale → `409` `TS_ABORTED`.
 * Use: rename or toggle — body `{ label?, isActive? }`.
 * Returns: `{ data: row }`.
 */
requirementsRouter.patch(
  "/requirements/:id",
  admin,
  catchAsync(async (req, res) => {
    const { id } = parseQuery(idParams, req);
    const input = parseBody(
      z.object({ label: label.optional(), isActive: z.boolean().optional() }),
      req,
    );
    const existing = await findOrThrow(id);
    const patch: Partial<RequirementRow> = {};
    if (input.label !== undefined) patch.label = input.label;
    if (input.isActive !== undefined) patch.isActive = input.isActive;
    if (Object.keys(patch).length > 0) await ContentModel.update(id, patch);
    const updated = { ...existing, ...patch };
    await AdminActionLogModel.log(
      sessionUser(req).id,
      "Updated requirement",
      String(updated.label),
    );
    okOne(res, toView(updated));
  }),
);

/**
 * `DELETE /api/v1/requirements/:id`
 * Access: session + admin surface.
 * Concurrency: timestamp ordering — optional body `ts`; stale → `409` `TS_ABORTED`.
 * Use: delete one.
 * Returns: `{ data: row }`.
 */
requirementsRouter.delete(
  "/requirements/:id",
  admin,
  catchAsync(async (req, res) => {
    const { id } = parseQuery(idParams, req);
    const existing = await findOrThrow(id);
    await ContentModel.remove(id);
    await AdminActionLogModel.log(
      sessionUser(req).id,
      "Deleted requirement",
      existing.label,
    );
    okOne(res, { id });
  }),
);
