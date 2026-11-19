import { Router } from "express";
import { z } from "zod";
import { slidingWindowRateLimit } from "../../lib/platform/rate-limit.js";
import {
  requireSession,
  requireSurface,
  sessionUser,
  type AuthedRequest,
} from "../../middleware/auth.js";
import { catchAsync } from "../../middleware/catchAsync.js";
import { okOne } from "../../middleware/http.js";
import {
  beginCalendarConnect,
  calendarStatus,
  disconnectCalendar,
  finishCalendarConnect,
  resyncCalendar,
} from "../../services/calendar.js";

/**
 * `/api/v1` — an instructor's optional Google Calendar connection.
 */
export const calendarRouter = Router();

const instructor = [requireSession, requireSurface("instructor")];

const calendarLimit = slidingWindowRateLimit({
  windowMs: 60_000,
  max: 10,
  key: (req) => {
    const id = (req as AuthedRequest).session?.user?.id;
    return id ? `calendar:${id}` : null;
  },
  message: "Too many calendar requests — wait a minute, then retry.",
});

const callbackQuery = z.object({
  code: z.string().min(1).max(2048).optional(),
  state: z.string().min(1).max(2048).optional(),
  error: z.string().max(200).optional(),
});

/**
 * `GET /api/v1/me/calendar`
 * Access: session + instructor surface.
 * Use: whether Calendar is available to me and how my connection is doing.
 * Returns: `{ data: { available, status, sync, googleEmail, lastSyncAt, lastError } }`.
 */
calendarRouter.get(
  "/me/calendar",
  instructor,
  catchAsync(async (req, res) => {
    okOne(res, await calendarStatus(sessionUser(req).id));
  }),
);

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
  catchAsync(async (req, res) => {
    okOne(res, await beginCalendarConnect(sessionUser(req).id));
  }),
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
  catchAsync(async (req, res) => {
    const userId = sessionUser(req).id;
    const query = callbackQuery.safeParse(req.query);
    let outcome = "error";
    if (query.success && query.data.code && query.data.state) {
      try {
        await finishCalendarConnect(userId, {
          code: query.data.code,
          state: query.data.state,
        });
        outcome = "connected";
      } catch {
        outcome = "error";
      }
    }
    res.redirect(`/instructor?calendar=${outcome}`);
  }),
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
  catchAsync(async (req, res) => {
    okOne(res, await resyncCalendar(sessionUser(req).id));
  }),
);

/**
 * `DELETE /api/v1/me/calendar`
 * Access: session + instructor surface.
 * Concurrency: timestamp ordering — optional body `ts`; stale → `409` `TS_ABORTED`.
 * Use: disconnect — removes the mirrored calendar and the stored token; my
 * ERPSYS schedule stays.
 * Returns: `{ data: status }`.
 */
calendarRouter.delete(
  "/me/calendar",
  instructor,
  catchAsync(async (req, res) => {
    const userId = sessionUser(req).id;
    await disconnectCalendar(userId, true);
    okOne(res, await calendarStatus(userId));
  }),
);
