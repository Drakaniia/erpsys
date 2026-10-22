import type { Db } from "mongodb";
import { describe, expect, it } from "vitest";
import { COLLECTIONS } from "../../../src/lib/db/db.js";
import {
  sweepStaleAvailability,
  sweepStaleServing,
} from "../../../src/lib/db/sweeps.js";
import { fakeDb } from "../../helpers/fakeDb.js";

const HOUR = 60 * 60 * 1000;

describe("sweepStaleAvailability", () => {
  it("closes an idle queue and unassigns the adviser", async () => {
    const { db, store } = fakeDb({
      [COLLECTIONS.adviserAvailability]: [
        {
          _id: "av-1",
          adviserId: "adv1",
          departmentId: "dept-1",
          academicYearId: "ay-1",
          isOpen: true,
          lastActiveAt: new Date(Date.now() - 2 * HOUR),
        },
      ],
      [COLLECTIONS.adviserDepartment]: [
        { _id: "link-1", adviserId: "adv1", departmentId: "dept-1" },
      ],
      [COLLECTIONS.enrollmentQueue]: [],
    });

    await sweepStaleAvailability(db as unknown as Db);
    expect(store[COLLECTIONS.adviserAvailability][0].isOpen).toBe(false);
    expect(store[COLLECTIONS.adviserAvailability][0].closedAt).toBeInstanceOf(
      Date,
    );
    expect(store[COLLECTIONS.adviserDepartment]).toHaveLength(0);
  });

  it("keeps an idle queue open while the adviser is mid-serve", async () => {
    const { db, store } = fakeDb({
      [COLLECTIONS.adviserAvailability]: [
        {
          _id: "av-1",
          adviserId: "adv1",
          departmentId: "dept-1",
          academicYearId: "ay-1",
          isOpen: true,
          lastActiveAt: new Date(Date.now() - 2 * HOUR),
        },
      ],
      [COLLECTIONS.enrollmentQueue]: [
        {
          _id: "q-1",
          departmentId: "dept-1",
          status: "IN_PROGRESS",
          servedById: "adv1",
        },
      ],
    });

    await sweepStaleAvailability(db as unknown as Db);
    expect(store[COLLECTIONS.adviserAvailability][0].isOpen).toBe(true);
  });
});

describe("sweepStaleServing", () => {
  it("returns a 90-minute serving lock to the queue", async () => {
    const { db, store } = fakeDb({
      [COLLECTIONS.enrollmentQueue]: [
        {
          _id: "q-1",
          departmentId: "dept-1",
          academicYearId: "ay-1",
          status: "IN_PROGRESS",
          servedById: "adv1",
          servedAt: new Date(Date.now() - 2 * HOUR),
          joinedAt: new Date(Date.now() - 3 * HOUR),
        },
      ],
      [COLLECTIONS.adminActionLog]: [],
      [COLLECTIONS.notification]: [],
      [COLLECTIONS.user]: [
        { _id: "adv1", email: "adv@buksu.edu.ph", role: "ENROLLMENT_ADVISER" },
      ],
    });

    await sweepStaleServing(db as unknown as Db);
    const entry = store[COLLECTIONS.enrollmentQueue][0];
    expect(entry.status).toBe("WAITING");
    expect(entry.servedById).toBeNull();
    expect(store[COLLECTIONS.adminActionLog][0].action).toBe(
      "AUTO_RETURN_STALE_SERVING",
    );
    expect(store[COLLECTIONS.notification][0]).toMatchObject({
      userId: "adv1",
      type: "STALE_SERVING_RETURNED",
    });
  });

  it("leaves a fresh serving lock alone", async () => {
    const { db, store } = fakeDb({
      [COLLECTIONS.enrollmentQueue]: [
        {
          _id: "q-1",
          departmentId: "dept-1",
          academicYearId: "ay-1",
          status: "IN_PROGRESS",
          servedById: "adv1",
          servedAt: new Date(),
          joinedAt: new Date(),
        },
      ],
    });

    await sweepStaleServing(db as unknown as Db);
    expect(store[COLLECTIONS.enrollmentQueue][0].status).toBe("IN_PROGRESS");
  });
});
