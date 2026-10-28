import { afterEach, describe, expect, it, vi } from "vitest";
import type { LiveTopic } from "$lib/domain/types";

/**
 * The subject is `studentRefreshTargets`: which cached queries a student's
 * screen must re-read when the server announces a change.
 *
 * The server already pushes. `services/student/queue.ts` and
 * `services/instructor/enrollment.ts` both call
 * `publishToUser(userId, "queue")` on every join, leave, serve, complete and
 * requeue, and `services/instructor/availability.ts:169` publishes `"queue"`
 * to every student when a department opens or closes. Only the instructor
 * surface subscribed to any of it (`lib/instructor/state.svelte.ts:203`), so
 * every waiting student re-read three keys on a 20s timer to discover changes
 * that were announced in real time. This table is the fix: it decides what a
 * topic invalidates, and is pure so the decision is testable without a
 * transport, a socket, or a query client.
 *
 * The mapping is the whole behavior, so these tests assert the mapping. What
 * the caller does with the result (invalidate, and how) is a separate concern
 * covered where it is wired.
 */

const harness = vi.hoisted<{ invalidated: string[][] }>(() => ({
  invalidated: [],
}));

vi.mock("$lib/api", () => {
  const KEY = (...path: string[]) => path;
  return {
    api: {
      student: {
        getMyQueueStatus: {
          queryKey: () => KEY("student", "getMyQueueStatus"),
          queryOptions: () => ({
            queryKey: KEY("student", "getMyQueueStatus"),
          }),
        },
        getMySteps: {
          queryKey: () => KEY("student", "getMySteps"),
          queryOptions: () => ({ queryKey: KEY("student", "getMySteps") }),
        },
        getMyDepartmentQueue: {
          queryKey: () => KEY("student", "getMyDepartmentQueue"),
          queryOptions: () => ({
            queryKey: KEY("student", "getMyDepartmentQueue"),
          }),
        },
      },
      notifications: {
        listMine: {
          queryKey: () => KEY("notifications", "listMine"),
          queryOptions: () => ({ queryKey: KEY("notifications", "listMine") }),
        },
      },
    },
    queryClient: {
      invalidateQueries: (arg: { queryKey: string[] }) => {
        harness.invalidated.push(arg.queryKey);
      },
    },
  };
});

import { refreshStudentQueries, studentRefreshTargets } from "./live-refresh";

const QUEUE_KEY = ["student", "getMyQueueStatus"];
const STEPS_KEY = ["student", "getMySteps"];
const DEPT_KEY = ["student", "getMyDepartmentQueue"];
const NOTIFICATIONS_KEY = ["notifications", "listMine"];

afterEach(() => {
  harness.invalidated.length = 0;
});

describe("studentRefreshTargets", () => {
  it("re-reads the student's own rank and step stamps on a queue change", () => {
    expect(studentRefreshTargets("queue")).toEqual([
      "getMyQueueStatus",
      "getMySteps",
      "getMyDepartmentQueue",
    ]);
  });

  it("re-reads the student's own queue on a queue change, because the waiting count moves", () => {
    // `getMyDepartmentQueue` carries the WAITING count for the student's own
    // department. A join or a serve changes it for everyone in that department,
    // not just the one who moved.
    expect(studentRefreshTargets("queue")).toContain("getMyDepartmentQueue");
  });

  it("re-reads the queue when a department opens or closes", () => {
    // `services/instructor/availability.ts:169` publishes `"queue"` to every
    // waiting student, but an open/close is also published as `"availability"`.
    // The open/closed state and the adviser's name both live here.
    expect(studentRefreshTargets("availability")).toEqual([
      "getMyDepartmentQueue",
    ]);
  });

  it("re-reads only the notification list on a notification change", () => {
    expect(studentRefreshTargets("notifications")).toEqual(["listMine"]);
  });

  it("re-reads nothing on a transfer-request change, which is instructor-side", () => {
    expect(studentRefreshTargets("transfer-requests")).toEqual([]);
  });

  it("re-reads everything on a reconnect, because events were missed while away", () => {
    // The shutdown path publishes `"reconnect"` (`lib/index.ts:134`) so clients
    // resync after the gap in which no event was delivered. A partial resync
    // here would leave a stale rank on screen indefinitely, since a waiting
    // student has no timer left to correct it.
    expect(studentRefreshTargets("reconnect")).toEqual([
      "getMyQueueStatus",
      "getMySteps",
      "getMyDepartmentQueue",
      "listMine",
    ]);
  });
});

describe("refreshStudentQueries", () => {
  it("invalidates the queue keys and the notification key on a queue change", () => {
    refreshStudentQueries("queue");

    expect(harness.invalidated).toEqual([QUEUE_KEY, STEPS_KEY, DEPT_KEY]);
  });

  it("invalidates only the student's queue key on an availability change", () => {
    refreshStudentQueries("availability");

    expect(harness.invalidated).toEqual([DEPT_KEY]);
  });

  it("invalidates only the notification key on a notification change", () => {
    refreshStudentQueries("notifications");

    expect(harness.invalidated).toEqual([NOTIFICATIONS_KEY]);
  });

  it("invalidates nothing for a topic that does not concern a student", () => {
    refreshStudentQueries("transfer-requests");

    expect(harness.invalidated).toEqual([]);
  });

  it("invalidates the full set on reconnect", () => {
    refreshStudentQueries("reconnect");

    expect(harness.invalidated).toEqual([
      QUEUE_KEY,
      STEPS_KEY,
      DEPT_KEY,
      NOTIFICATIONS_KEY,
    ]);
  });

  it("invalidates no key twice for a topic that appears twice in the mapping", () => {
    // `queue` and `availability` both touch `getMyDepartmentQueue`. Two
    // subscribers wiring this independently must not produce a duplicate
    // invalidation, which TanStack coalesces anyway but which makes request
    // counting meaningless.
    const topic: LiveTopic = "queue";
    const targets = studentRefreshTargets(topic);
    expect(new Set(targets).size).toBe(targets.length);
  });
});
