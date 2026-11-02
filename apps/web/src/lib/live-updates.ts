import type { LiveEvent } from "$lib/domain/types";

/**
 * The `/api/events` stream, as a plain callback subscription.
 *
 * Role-agnostic: the transport is identical for every surface, and what a topic
 * means is the caller's business — see `lib/instructor/state.ts` for the
 * instructor mapping and `lib/student/live-refresh.ts` for the student one.
 * Sharing the socket matters more than it looks: a student with the queue page
 * and the dashboard open would otherwise open two `EventSource` connections to
 * the same endpoint, and `lib/sse/sse.ts` keys its listener set per user, so each
 * connection costs a server-side listener.
 */
const STREAM_URL = "/api/events";

export function connectLiveUpdates(
  onEvent: (event: LiveEvent) => void,
): () => void {
  // Standalone-API mode: absolute stream URL + credentials so the session
  // cookie crosses origins. Same-origin default keeps the relative URL.
  const base = (
    (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? ""
  ).replace(/\/+$/, "");
  const source = new EventSource(base + STREAM_URL, {
    withCredentials: true,
  });

  source.onmessage = (message) => {
    try {
      const event = JSON.parse(message.data) as LiveEvent;
      if (event && typeof event.topic === "string") onEvent(event);
    } catch {
      // A malformed frame is dropped rather than thrown: `onmessage` runs on the
      // event loop, and an exception here would kill the subscription and leave
      // the page silently relying on whatever fallback it has.
    }
  };

  return () => source.close();
}
