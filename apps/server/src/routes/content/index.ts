import { Router } from "express";
import { contentController } from "../../controllers/content/ContentController.js";
import { requireSession, requireSurface } from "../../middleware/auth.js";

/**
 * `/api/v1` — officer/admin content: profiling Google Form, social links, chatbot
 * knowledge, signup options.
 */
export const contentRouter = Router();

const admin = [requireSession, requireSurface("admin")];
const officer = [requireSession, requireSurface("officer")];

/**
 * `GET /api/v1/profiling-form`
 * Access: session + officer surface.
 * Use: read the active year's linked Google Form.
 * Returns: `{ data: { formId, title, responderUri, editUrl, updatedByName, updatedAt } }`, or `null` when none.
 */
contentRouter.get(
  "/profiling-form",
  officer,
  contentController.getProfilingForm,
);

/**
 * `POST /api/v1/profiling-form`
 * Access: session + officer surface.
 * Concurrency: timestamp ordering — optional body `ts`; stale → `409` `TS_ABORTED`.
 * Use: create the year's Google Form through the Forms API (verified-email collection, published, shared with the caller) — body `{ title }`.
 * Returns: `201` with `{ data: form }`; `409` when one is already linked.
 */
contentRouter.post(
  "/profiling-form",
  officer,
  contentController.createProfilingForm,
);

/**
 * `DELETE /api/v1/profiling-form`
 * Access: session + officer surface.
 * Concurrency: timestamp ordering — optional body `ts`; stale → `409` `TS_ABORTED`.
 * Use: unlink the year's Google Form (the form itself stays in Google Drive).
 * Returns: `{ data: { ok: true } }`.
 */
contentRouter.delete(
  "/profiling-form",
  officer,
  contentController.removeProfilingForm,
);

/**
 * `GET /api/v1/social-links`
 * Access: session + officer surface.
 * Use: list links in display order (query `page`, `pageSize`).
 * Returns: `{ data, page, pageSize, total }`.
 */
contentRouter.get("/social-links", officer, contentController.listLinks);

/**
 * `POST /api/v1/social-links`
 * Access: session + officer surface.
 * Concurrency: timestamp ordering — optional body `ts`; stale → `409` `TS_ABORTED`.
 * Use: add a link — body `{ id?, name, url }`.
 * Returns: `201` when new, else `{ data: link }`.
 */
contentRouter.post("/social-links", officer, contentController.saveLink);

/**
 * `PUT /api/v1/social-links/order`
 * Access: session + officer surface.
 * Concurrency: timestamp ordering — optional body `ts`; stale → `409` `TS_ABORTED`.
 * Use: reorder — body `{ orderedIds }`.
 * Returns: `{ data: { ok: true } }`.
 */
contentRouter.put(
  "/social-links/order",
  officer,
  contentController.reorderLinks,
);

/**
 * `PATCH /api/v1/social-links/:id`
 * Access: session + officer surface.
 * Concurrency: timestamp ordering — optional body `ts`; stale → `409` `TS_ABORTED`.
 * Use: edit one — body `{ name, url }`.
 * Returns: `{ data: link }`.
 */
contentRouter.patch("/social-links/:id", officer, contentController.updateLink);

/**
 * `DELETE /api/v1/social-links/:id`
 * Access: session + officer surface.
 * Concurrency: timestamp ordering — optional body `ts`; stale → `409` `TS_ABORTED`.
 * Use: remove one.
 * Returns: `{ data: { ok: true } }`.
 */
contentRouter.delete(
  "/social-links/:id",
  officer,
  contentController.removeLink,
);

/**
 * `GET /api/v1/chatbot-knowledge`
 * Access: session + admin surface.
 * Use: read the chatbot knowledge text.
 * Returns: `{ data: { content } }`.
 */
contentRouter.get("/chatbot-knowledge", admin, contentController.getKnowledge);

/**
 * `PUT /api/v1/chatbot-knowledge`
 * Access: session + admin surface.
 * Concurrency: timestamp ordering — optional body `ts`; stale → `409` `TS_ABORTED`.
 * Use: replace it — body `{ content }`, up to 200k characters.
 * Returns: `{ data: { content } }`.
 */
contentRouter.put("/chatbot-knowledge", admin, contentController.saveKnowledge);

/**
 * `GET /api/v1/signup-options`
 * Access: public.
 * Use: departments and year levels for the register page.
 * Returns: `{ data: { departments, yearLevels } }`.
 */
contentRouter.get("/signup-options", contentController.signupOptions);
