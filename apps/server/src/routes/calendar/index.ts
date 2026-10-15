import { Router } from "express";
import { calendarController } from "../../controllers/calendar/CalendarController.js";
import { requireSession, requireSurface } from "../../middleware/auth.js";
import { slidingWindowRateLimit } from "../../lib/platform/rate-limit.js";
import type { AuthedRequest } from "../../services/auth/AuthService.js";

/**
 * `/api/v1` — an instructor's optional Google Calendar connection.
 */
export const calendarRouter = Router();

const instructor = [requireSession, requireSurface("instructor")];

const calendarLimit = slidingWindowRateLimit({
  windowMs: 60_000,
  max: 10,
  key: (req) => {
    const session = (req as AuthedRequest).session;
    return session?.user?.id ? `calendar:${session.user.id}` : null;
  },
  message: "Too many calendar requests — wait a minute, then retry.",
});

/**
 * `GET /api/v1/me/calendar`
 * Access: session + instructor surface.
 * Use: whether Calendar is available to me and how my connection is doing.
 * Returns: `{ data: { available, status, sync, googleEmail, lastSyncAt, lastError } }`.
 */
calendarRouter.get("/me/calendar", instructor, calendarController.status);

/**
 * `GET /api/v1/me/calendar/connect`
 * Access: session + instructor surface.
 * Use: start the Google consent flow.
 * Returns: `{ data: { url } }`; `412` while the integration is off.
 */
calendarRouter.get(
  "/me/calendar/connect",
  instructor,
  calendarLimit,
  calendarController.connect,
);

/**
 * `GET /api/v1/calendar/callback`
 * Access: session + instructor surface.
 * Use: Google's redirect target — query `code`, `state`.
 * Returns: `302` to `/instructor?calendar=connected` or `?calendar=error`.
 */
calendarRouter.get(
  "/calendar/callback",
  instructor,
  calendarLimit,
  calendarController.callback,
);

/**
 * `POST /api/v1/me/calendar/sync`
 * Access: session + instructor surface.
 * Concurrency: timestamp ordering — optional body `ts`; stale → `409` `TS_ABORTED`.
 * Use: push my schedule to Google again, resetting the retry count.
 * Returns: `{ data: status }`; `412` while the integration is off.
 */
calendarRouter.post(
  "/me/calendar/sync",
  instructor,
  calendarLimit,
  calendarController.sync,
);

/**
 * `DELETE /api/v1/me/calendar`
 * Access: session + instructor surface.
 * Concurrency: timestamp ordering — optional body `ts`; stale → `409` `TS_ABORTED`.
 * Use: disconnect — removes the mirrored calendar and the stored token; my
 * ERPSYS schedule stays.
 * Returns: `{ data: status }`.
 */
calendarRouter.delete("/me/calendar", instructor, calendarController.disconnect);
