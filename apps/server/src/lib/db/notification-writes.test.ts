import { describe, expect, it } from "vitest";
import type { Db } from "mongodb";
import { COLLECTIONS } from "./db.js";
import { notifyUser } from "./notification-writes.js";

/**
 * `notifyUser` is the single write path for every user-facing notification, so
 * this file asserts the shape of the row it inserts rather than any service's
 * use of it. The optional `action` (D8) is additive: an existing caller that
 * keeps passing four arguments must still get a row the read schema accepts.
 */
function captureDb() {
  const docs: Record<string, unknown>[] = [];
  const collection = () => ({
    insertOne: async (doc: Record<string, unknown>) => {
      docs.push(doc);
      return { acknowledged: true };
    },
  });
  return { db: { collection } as unknown as Db, docs };
}

describe("notifyUser", () => {
  it("writes the userId, type, title and body it was given", async () => {
    const { db, docs } = captureDb();

    await notifyUser(
      db,
      "u-1",
      "ENROLLED",
      "Enrollment complete",
      "You're in.",
    );

    expect(docs).toHaveLength(1);
    expect(docs[0]).toMatchObject({
      userId: "u-1",
      type: "ENROLLED",
      title: "Enrollment complete",
      body: "You're in.",
      action: null,
    });
    expect(docs[0].createdAt).toBeInstanceOf(Date);
  });

  it("stays valid without the options argument, writing a null action", async () => {
    const { db, docs } = captureDb();

    await notifyUser(db, "u-1", "QUEUE_JOINED", "In line", "Position #1.");

    // A missing action must not be `undefined`: the read schema maps a missing
    // field to null anyway, but writing it explicitly keeps the document shape
    // uniform for anything that reads the collection directly.
    expect(docs[0]).toHaveProperty("action", null);
  });

  it("writes the action it was handed", async () => {
    const { db, docs } = captureDb();

    await notifyUser(
      db,
      "u-1",
      "ENROLLED",
      "Enrollment complete",
      "You're in.",
      {
        action: {
          kind: "enrollment-report",
          label: "Download enrollment report",
        },
      },
    );

    expect(docs[0].action).toEqual({
      kind: "enrollment-report",
      label: "Download enrollment report",
    });
  });

  it("writes a null action when asked for none explicitly", async () => {
    const { db, docs } = captureDb();

    await notifyUser(
      db,
      "u-1",
      "ENROLLED",
      "Enrollment complete",
      "You're in.",
      {
        action: null,
      },
    );

    expect(docs[0].action).toBeNull();
  });
});
