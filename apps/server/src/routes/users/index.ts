import { Router } from "express";
import { usersController } from "../../controllers/users/UsersController.js";
import { requireSession, requireSurface } from "../../middleware/auth.js";

/**
 * `/api/v1` — the admin user table: bulk verbs on the collection, the rest on
 * `/:userId`.
 */
export const usersRouter = Router();

const admin = [requireSession, requireSurface("admin")];

/**
 * `GET /api/v1/users`
 * Access: session + admin surface.
 * Use: user table with filters and paging.
 * Returns: `{ data, page, pageSize, total }`.
 */
usersRouter.get("/users", admin, usersController.list);

/**
 * `PATCH /api/v1/users`
 * Access: session + admin surface.
 * Concurrency: timestamp ordering — optional body `ts`; stale → `409` `TS_ABORTED`.
 * Use: change roles in bulk — body `{ userIds, role }`.
 * Returns: `{ data: update result }`.
 */
usersRouter.patch("/users", admin, usersController.bulkRole);

/**
 * `DELETE /api/v1/users`
 * Access: session + admin surface.
 * Concurrency: timestamp ordering — optional body `ts`; stale → `409` `TS_ABORTED`.
 * Use: delete up to 500 accounts — body `{ userIds }`.
 * Returns: `{ data: delete result }`.
 */
usersRouter.delete("/users", admin, usersController.bulkDelete);

/**
 * `PATCH /api/v1/users/:userId`
 * Access: session + admin surface.
 * Concurrency: timestamp ordering — optional body `ts`; stale → `409` `TS_ABORTED`.
 * Use: set one role — body `{ role }`.
 * Returns: `{ data: user }`.
 */
usersRouter.patch("/users/:userId", admin, usersController.setRole);

/**
 * `DELETE /api/v1/users/:userId`
 * Access: session + admin surface.
 * Concurrency: timestamp ordering — optional body `ts`; stale → `409` `TS_ABORTED`.
 * Use: purge one account and its records.
 * Returns: `{ data: purge result }`.
 */
usersRouter.delete("/users/:userId", admin, usersController.purge);

/**
 * `POST /api/v1/users/:userId/password-reset`
 * Access: session + admin surface.
 * Concurrency: timestamp ordering — optional body `ts`; stale → `409` `TS_ABORTED`.
 * Use: set a new password — body `{ newPassword }`, 8–128 characters.
 * Returns: `{ data: reset result }`.
 */
usersRouter.post(
  "/users/:userId/password-reset",
  admin,
  usersController.resetPassword,
);
