import { Router, type RequestHandler } from "express";
import { z } from "zod";
import { ApiError } from "../../config/errors.js";
import { invalidateKnowledgeCache } from "../../lib/chat/knowledge.js";
import { COLLECTIONS, getDbSync, idIn } from "../../lib/db/db.js";
import { genId } from "../../lib/db/ids.js";
import { createForm } from "../../lib/google/forms.js";
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
import { AcademicYearModel } from "../../models/AcademicYearModel.js";
import { AdminActionLogModel } from "../../models/AdminActionLogModel.js";
import { DepartmentModel } from "../../models/DepartmentModel.js";

import type { SocialLinkRow } from "../../models/SocialMediaLinkModel.js";
import { activeYearOrThrow } from "../../services/academic-years.js";
import {
  assertFormsEnabled,
  listSocialLinks,
  readProfilingForm,
  socialLinkView,
} from "../../services/content.js";
import { departmentView } from "../../services/departments.js";

/**
 * `/api/v1` — officer/admin content: profiling Google Form, social links, chatbot
 * knowledge and signup options.
 */
export const contentRouter = Router();

const admin = [requireSession, requireSurface("admin")];
const contentManagers: RequestHandler[] = [
  requireSession,
  (req, res, next) => {
    const surface = sessionUser(req).role === "ADMIN" ? "admin" : "officer";
    requireSurface(surface)(req, res, next);
  },
];
const idParams = z.object({ id: z.string().min(1) });
const linkBody = {
  name: z.string().trim().min(1).max(120),
  url: z.string().url().max(1000),
};
const links = () =>
  getDbSync().collection<SocialLinkRow>(COLLECTIONS.socialMediaLink);

type KnowledgeDoc = {
  _id: string;
  content: string;
  version: number;
  updatedById?: string;
  updatedAt: Date;
};

const knowledge = () =>
  getDbSync().collection<KnowledgeDoc>(COLLECTIONS.chatbotKnowledge);

async function latestKnowledge(): Promise<KnowledgeDoc | null> {
  const [doc] = await knowledge()
    .find({} as never)
    .sort({ updatedAt: -1 })
    .limit(1)
    .toArray();
  return doc ?? null;
}

/**
 * `GET /api/v1/chatbot-knowledge`
 * Access: session + admin surface.
 * Use: read the chatbot knowledge text.
 * Returns: `{ data: { content, version, updatedById, updatedByName, updatedAt } }`, or `null` when none.
 */
contentRouter.get(
  "/chatbot-knowledge",
  admin,
  catchAsync(async (_req, res) => {
    const doc = await latestKnowledge();
    if (!doc) return okOne(res, null);
    const updater = doc.updatedById
      ? await getDbSync()
          .collection<{ _id: string; name: string }>(COLLECTIONS.user)
          .findOne(idIn([doc.updatedById]) as never)
      : null;
    okOne(res, {
      content: doc.content,
      version: doc.version,
      updatedById: updater ? String(updater._id) : null,
      updatedByName: updater?.name ?? null,
      updatedAt: new Date(doc.updatedAt).toISOString(),
    });
  }),
);

/**
 * `PUT /api/v1/chatbot-knowledge`
 * Access: session + admin surface.
 * Concurrency: timestamp ordering — optional body `ts`; stale → `409` `TS_ABORTED`.
 * Use: replace it — body `{ content }`, up to 200k characters.
 * Returns: `{ data: { version, updatedAt } }`.
 */
contentRouter.put(
  "/chatbot-knowledge",
  admin,
  catchAsync(async (req, res) => {
    const { content } = parseBody(
      z.object({ content: z.string().max(200_000) }),
      req,
    );
    const actorId = sessionUser(req).id;
    const existing = await latestKnowledge();
    const updatedAt = new Date();
    const version = existing ? existing.version + 1 : 1;
    if (existing) {
      await knowledge().updateOne(
        { _id: existing._id } as never,
        {
          $set: { content, version, updatedById: actorId, updatedAt },
        } as never,
      );
    } else {
      await knowledge().insertOne({
        _id: genId("knowledge"),
        content,
        version,
        updatedById: actorId,
        updatedAt,
        createdAt: updatedAt,
      } as never);
    }
    invalidateKnowledgeCache();
    await AdminActionLogModel.log(
      actorId,
      "Updated chatbot doc",
      `v${version}`,
    );
    okOne(res, { version, updatedAt: updatedAt.toISOString() });
  }),
);

async function rename(id: string, input: { name: string; url: string }) {
  const existing = await links().findOne(idIn([id]) as never);
  if (!existing) {
    throw new ApiError("NOT_FOUND", { message: "That link no longer exists." });
  }
  await links().updateOne(
    idIn([id]) as never,
    { $set: { name: input.name, url: input.url } } as never,
  );
  return socialLinkView({ ...existing, name: input.name, url: input.url });
}

/**
 * `GET /api/v1/profiling-form`
 * Access: session + officer surface or session + admin surface.
 * Use: read the active year's linked Google Form.
 * Returns: `{ data: { formId, title, responderUri, editUrl, updatedByName, updatedAt } }`, or `null` when none.
 */
contentRouter.get(
  "/profiling-form",
  contentManagers,
  catchAsync(async (_req, res) => {
    okOne(res, await readProfilingForm());
  }),
);

/**
 * `POST /api/v1/profiling-form`
 * Access: session + officer surface or session + admin surface.
 * Concurrency: timestamp ordering — optional body `ts`; stale → `409` `TS_ABORTED`.
 * Use: create the year's Google Form through the Forms API (verified-email collection, published, shared with the caller) — body `{ title }`.
 * Returns: `201` with `{ data: form }`; `409` when one is already linked.
 */
contentRouter.post(
  "/profiling-form",
  contentManagers,
  catchAsync(async (req, res) => {
    const { title } = parseBody(
      z.object({ title: z.string().trim().min(1).max(200) }),
      req,
    );
    const actor = sessionUser(req);
    await assertFormsEnabled(
      "Google Forms is turned off — an admin can turn it back on under Integrations.",
    );
    const year = await activeYearOrThrow();
    const existing = year.profilingForm;
    if (existing?.formId) {
      throw new ApiError("CONFLICT", {
        message: "A Google Form is already linked — unlink it first.",
      });
    }
    const { formId, responderUri } = await createForm(title, actor.email);
    await AcademicYearModel.setProfilingForm(String(year._id), {
      formId,
      title,
      responderUri,
      updatedById: actor.id,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    if (actor.role === "ADMIN") {
      await AdminActionLogModel.log(
        actor.id,
        "Created profiling Google Form",
        `${year.label} · ${year.semesterLabel}`,
      );
    }
    okOne(res, await readProfilingForm(), 201);
  }),
);

/**
 * `DELETE /api/v1/profiling-form`
 * Access: session + officer surface or session + admin surface.
 * Concurrency: timestamp ordering — optional body `ts`; stale → `409` `TS_ABORTED`.
 * Use: unlink the year's Google Form (the form itself stays in Google Drive).
 * Returns: `{ data: { ok: true } }`.
 */
contentRouter.delete(
  "/profiling-form",
  contentManagers,
  catchAsync(async (req, res) => {
    const actor = sessionUser(req);
    const year = await activeYearOrThrow();
    await AcademicYearModel.setProfilingForm(String(year._id), null);
    if (actor.role === "ADMIN") {
      await AdminActionLogModel.log(
        actor.id,
        "Unlinked profiling Google Form",
        `${year.label} · ${year.semesterLabel}`,
      );
    }
    okOne(res, { ok: true });
  }),
);

/**
 * `GET /api/v1/social-links`
 * Access: session + officer surface or session + admin surface.
 * Use: list links in display order (query `page`, `pageSize`).
 * Returns: `{ data, page, pageSize, total }`.
 */
contentRouter.get(
  "/social-links",
  contentManagers,
  catchAsync(async (req, res) => {
    const items = await listSocialLinks();
    const { page, pageSize } = parsePagination(req);
    okList(res, items, page, pageSize, items.length);
  }),
);

/**
 * `POST /api/v1/social-links`
 * Access: session + officer surface or session + admin surface.
 * Concurrency: timestamp ordering — optional body `ts`; stale → `409` `TS_ABORTED`.
 * Use: add a link — body `{ id?, name, url }`.
 * Returns: `201` when new, else `{ data: link }`.
 */
contentRouter.post(
  "/social-links",
  contentManagers,
  catchAsync(async (req, res) => {
    const input = parseBody(
      z.object({ id: z.string().optional(), ...linkBody }),
      req,
    );
    if (input.id) return okOne(res, await rename(input.id, input));
    const [highest] = await links()
      .find({} as never)
      .sort({ order: -1 })
      .limit(1)
      .toArray();
    const row: SocialLinkRow = {
      _id: genId("sml"),
      name: input.name,
      url: input.url,
      order: (highest?.order ?? 0) + 1,
      isActive: true,
    };
    await links().insertOne({ ...row, createdAt: new Date() } as never);
    okOne(res, socialLinkView(row), 201);
  }),
);

/**
 * `PUT /api/v1/social-links/order`
 * Access: session + officer surface or session + admin surface.
 * Concurrency: timestamp ordering — optional body `ts`; stale → `409` `TS_ABORTED`.
 * Use: reorder — body `{ orderedIds }`.
 * Returns: `{ data: { ok: true } }`.
 */
contentRouter.put(
  "/social-links/order",
  contentManagers,
  catchAsync(async (req, res) => {
    const { orderedIds } = parseBody(
      z.object({ orderedIds: z.array(z.string().min(1)) }),
      req,
    );
    await Promise.all(
      orderedIds.map((id, index) =>
        links().updateOne(
          idIn([id]) as never,
          { $set: { order: index + 1 } } as never,
        ),
      ),
    );
    okOne(res, { ok: true });
  }),
);

/**
 * `PATCH /api/v1/social-links/:id`
 * Access: session + officer surface or session + admin surface.
 * Concurrency: timestamp ordering — optional body `ts`; stale → `409` `TS_ABORTED`.
 * Use: edit one — body `{ name, url }`.
 * Returns: `{ data: link }`.
 */
contentRouter.patch(
  "/social-links/:id",
  contentManagers,
  catchAsync(async (req, res) => {
    const { id } = parseQuery(idParams, req);
    okOne(res, await rename(id, parseBody(z.object(linkBody), req)));
  }),
);

/**
 * `DELETE /api/v1/social-links/:id`
 * Access: session + officer surface or session + admin surface.
 * Concurrency: timestamp ordering — optional body `ts`; stale → `409` `TS_ABORTED`.
 * Use: remove one.
 * Returns: `{ data: { ok: true } }`.
 */
contentRouter.delete(
  "/social-links/:id",
  contentManagers,
  catchAsync(async (req, res) => {
    const { id } = parseQuery(idParams, req);
    await links().deleteOne(idIn([id]) as never);
    okOne(res, { ok: true });
  }),
);

/**
 * `GET /api/v1/signup-options`
 * Access: public.
 * Use: departments and year levels for the register page.
 * Returns: `{ data: { departments, yearLevels } }`.
 */
contentRouter.get(
  "/signup-options",
  catchAsync(async (_req, res) => {
    const [years, departments] = await Promise.all([
      AcademicYearModel.options(),
      DepartmentModel.listActive(),
    ]);
    okOne(res, {
      academicYears: years.map((year) => ({
        id: String(year._id),
        label: year.label,
        semesterLabel: year.semesterLabel,
        isActive: !!year.isActive,
      })),
      departments: departments.map(departmentView),
    });
  }),
);
