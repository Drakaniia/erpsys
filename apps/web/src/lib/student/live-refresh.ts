import type { LiveTopic } from "$lib/domain/types";
import { api, queryClient } from "$lib/api";

/**
 * Which cached queries a student's screen must re-read for each live topic.
 *
 * The server has always pushed these; only the instructor surface listened.
 * `services/student/queue.ts:259,411` and
 * `services/instructor/enrollment.ts:336,471,765,937` publish `"queue"` on every
 * join, leave, serve, complete and requeue, and
 * `services/instructor/availability.ts:169` publishes it to every waiting
 * student when a department opens or closes. A student who ignores all of that
 * still learns the outcome, 20 seconds later, from `refetchInterval`.
 *
 * `getMyDepartmentQueue` is in the `"queue"` row on purpose. It carries the
 * WAITING count for the student's own department, and any join or serve moves
 * it — so the one request a departing student triggers invalidates it for
 * everyone in that department. It was once far more expensive than that: it
 * listed every department in the institution and aggregated the whole
 * `enrollmentQueue` collection on every poll. It is now scoped to one
 * department, but it is still the read most likely to be stale on screen, so it
 * stays on both the join and the availability topics.
 */

export type StudentRefreshTarget =
  | "getMyQueueStatus"
  | "getMySteps"
  | "getMyDepartmentQueue"
  | "listMine";

/**
 * Backstop poll for the student surface, not the primary refresh path.
 *
 * The server already announces every queue change and `refreshStudentQueries`
 * acts on those announcements, so a student normally hears about a rank change
 * in well under a second. The interval remains for what the stream cannot
 * cover: a tab that was closed or backgrounded, an event that arrived while the
 * socket was down with nothing to prompt a resync, or a topic added to the
 * server that the mapping above does not name.
 *
 * 20s was the old *primary* interval, and at a few hundred waiting students it
 * is the load the student surface used to generate on its own — dominated by
 * the then-institution-wide `getDepartments`, which aggregated over the whole
 * queue collection. That read is now scoped to one department, so the poll cost
 * has fallen with it; 90s still bounds the staleness of the unrecoverable cases
 * without re-creating that cost. The client limiter allows 300 requests/minute
 * per session (`apps/server/src/lib/rate-limit/rate-limit.ts:339`) and a student surface
 * spends four.
 */
export const STUDENT_BACKSTOP_POLL_MS = 90_000;

const ALL_TARGETS: StudentRefreshTarget[] = [
  "getMyQueueStatus",
  "getMySteps",
  "getMyDepartmentQueue",
  "listMine",
];

const TARGETS_BY_TOPIC: Record<LiveTopic, StudentRefreshTarget[]> = {
  queue: ["getMyQueueStatus", "getMySteps", "getMyDepartmentQueue"],
  availability: ["getMyDepartmentQueue"],
  notifications: ["listMine"],
  "transfer-requests": [],
  // Shutdown published so every stream reconnects instead of waiting out its own
  // retry. Whatever the client missed while disconnected was never delivered,
  // and a waiting student has no poll left to correct it, so reconnect resyncs
  // everything rather than trusting the last-known values.
  reconnect: ALL_TARGETS,
};

/**
 * oRPC's `queryKey()` is typed as a readonly array, so the record is declared
 * over `readonly unknown[]` rather than `unknown[]` â€” a mutable-array annotation
 * reads as "this will be pushed to" and is wrong.
 */
const queryKeyFor: Record<StudentRefreshTarget, () => readonly unknown[]> = {
  getMyQueueStatus: () => api.student.getMyQueueStatus.queryKey(),
  getMySteps: () => api.student.getMySteps.queryKey(),
  getMyDepartmentQueue: () => api.student.getMyDepartmentQueue.queryKey(),
  listMine: () => api.notifications.listMine.queryKey(),
};

export function studentRefreshTargets(
  topic: LiveTopic,
): StudentRefreshTarget[] {
  return TARGETS_BY_TOPIC[topic];
}

export function refreshStudentQueries(topic: LiveTopic): void {
  for (const target of studentRefreshTargets(topic)) {
    queryClient.invalidateQueries({ queryKey: queryKeyFor[target]() });
  }
}
