/**
 * Seeding for the load gate.
 *
 * The scenario needs 500 *distinct authenticated students*, and there is no API
 * that provisions 500 of them cheaply: `/api/auth/sign-up/student` is one
 * request per student and is Turnstile-gated whenever `TURNSTILE_SECRET_KEY` is
 * set. So the runner writes the documents the auth and student surfaces read
 * directly, and mints the session cookies Better Auth will accept.
 *
 * The cookie signing is `better-auth/dist/cookies` + `crypto/index.mjs`:
 * `session_token` is signed as `${token}.${base64(HMAC-SHA256(token, secret))}`
 * and the server reads the cookie under `better-auth.session_token`
 * (`getSessionCookie` accepts the unprefixed name even when the secure
 * `__Secure-` variant is configured). A session document is just
 * `{token, userId, expiresAt, ipAddress, userAgent, createdAt, updatedAt}` and
 * the Mongo adapter maps `id` to `_id`.
 *
 * Nothing here is written outside the run: every id it mints is tracked and
 * removed again by `teardown`.
 */

import { createHmac, randomUUID } from "node:crypto";

export const COLLECTIONS = {
  user: "user",
  session: "session",
  academicYear: "academic_year",
  studentProfile: "student_profile",
  studentEnrollment: "student_enrollment",
  step: "step",
  stepVerification: "step_verification",
  department: "department",
  adviserAvailability: "adviser_availability",
  adviserDepartment: "adviser_department",
  enrollmentQueue: "enrollment_queue",
  notification: "notification",
};

export const SESSION_COOKIE_NAME = "better-auth.session_token";
export const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

const ALPHABET =
  "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

function genId(prefix) {
  return `${prefix}-${randomUUID()}`;
}

function randomToken(length) {
  let out = "";
  const bytes = randomUUID().replace(/-/g, "");
  for (let i = 0; i < length; i += 1)
    out += ALPHABET[bytes.charCodeAt(i) % ALPHABET.length];
  return out;
}

/** Byte-for-byte what `better-auth` computes in `makeSignature`. */
export function signSessionToken(token, secret) {
  return `${token}.${createHmac("sha256", secret).update(token).digest("base64")}`;
}

export function sessionCookieHeader(token, secret) {
  return `${SESSION_COOKIE_NAME}=${signSessionToken(token, secret)}`;
}

/** Batched `insertMany`, because 500 students is 500×(1+1+1+steps) documents. */
async function insertInBatches(collection, docs, batchSize) {
  for (let i = 0; i < docs.length; i += batchSize) {
    await collection.insertMany(docs.slice(i, i + batchSize), {
      ordered: false,
    });
  }
}

/**
 * Ensure the run has an active academic year, an active department, and a
 * non-empty step catalog. Reuses whatever is already configured so the gate
 * measures the real database rather than a synthetic one; only records that are
 * genuinely absent are created, and only those are torn down.
 */
async function ensureFixtures(db, created) {
  const years = db.collection(COLLECTIONS.academicYear);
  let year = await years.findOne({ isActive: true });
  if (!year) {
    year = {
      _id: genId("ay"),
      label: "Load Test Year",
      semesterLabel: "First Semester",
      isActive: true,
      createdAt: new Date(),
    };
    await years.insertOne(year);
    created.academicYears.push(year._id);
  }

  const departments = db.collection(COLLECTIONS.department);
  let department = await departments.findOne({ isActive: true });
  if (!department) {
    department = {
      _id: genId("department"),
      name: "Load Test Department",
      yearLevels: [],
      isActive: true,
    };
    await departments.insertOne(department);
    created.departments.push(department._id);
  }

  // `joinQueue` verifies every `step` row it finds against
  // `PRE_ENROLLMENT_STEP_CODES` and refuses the join while any is unverified.
  // The set of *pre-enrollment* codes is owned by `lib/domain.ts` and is not
  // duplicated here — verifying every configured step is a superset, so the gate
  // never has to know which subset the server will demand.
  const steps = await db
    .collection(COLLECTIONS.step)
    .find({}, { projection: { _id: 1, code: 1 } })
    .toArray();
  if (steps.length === 0) {
    throw new Error(
      [
        'The "step" collection is empty, so no student can pass the joinQueue gate',
        "(services/student/queue.ts rejects a join until every pre-enrollment step is",
        "VERIFIED). Configure the step catalog in the app first, or point",
        "DATABASE_URL at a database that has it, then re-run.",
      ].join("\n"),
    );
  }

  return { year, department, steps };
}

/**
 * One adviser with an open, live queue. `liveAvailabilityPairs` treats a row as
 * live only while `isOpen` and `lastActiveAt` is inside AVAILABILITY_IDLE_MS, so
 * the heartbeat is stamped now — and `loadDurationS` is the reason a long run may
 * need the sweep interval (`lib/sweeps.ts`) to keep it open.
 */
async function ensureOpenQueue(db, config, created, departmentId, yearId) {
  const users = db.collection(COLLECTIONS.user);
  const now = new Date();
  const adviser = {
    _id: genId("user"),
    name: "Load Test Adviser",
    email: `loadtest-adviser+${created.runTag}@buksu.edu.ph`,
    emailVerified: true,
    image: null,
    role: "ENROLLMENT_ADVISER",
    isOutsideOrg: false,
    createdAt: now,
    updatedAt: now,
  };
  await users.insertOne(adviser);
  created.users.push(adviser._id);

  const availability = {
    _id: genId("availability"),
    adviserId: adviser._id,
    departmentId,
    academicYearId: yearId,
    isOpen: true,
    openedAt: now,
    closedAt: null,
    lastActiveAt: now,
    autoClosedAt: null,
  };
  await db.collection(COLLECTIONS.adviserAvailability).insertOne(availability);
  created.availabilities.push(availability._id);

  // An open adviser who has not been assigned any year levels covers nobody
  // (`adviserCoversLevel`), so `joinQueue` would refuse every seeded student
  // with "no adviser is currently serving..." and the pre-flight probe would
  // report that instead of a real measurement. The link is what makes the open
  // queue servable.
  const link = {
    _id: genId("adviserDepartment"),
    adviserId: adviser._id,
    departmentId,
    academicYearId: yearId,
    yearLevels: [...SEEDED_YEAR_LEVELS],
    createdAt: now,
  };
  await db.collection(COLLECTIONS.adviserDepartment).insertOne(link);
  created.adviserDepartments.push(link._id);

  return adviser;
}

/**
 * Every seeded student is one of these, and the seeded adviser is assigned all
 * of them. Kept to one value so the gate measures a join that is actually
 * allowed — a mismatch here turns the whole run into 409s.
 */
const SEEDED_YEAR_LEVEL = "SECOND";
const SEEDED_YEAR_LEVELS = ["FIRST", "SECOND", "THIRD", "FOURTH", "FIFTH"];

function studentDocs(index, runTag, yearId, departmentId, now) {
  const userId = genId("user");
  const profileId = genId("profile");
  const sessionId = genId("session");
  // Numeric and unique: `student_profile.studentNumber` carries a unique index
  // after Phase 1, so a collision here fails the seed loudly rather than quietly.
  const studentNumber = String(900000000 + index);
  const token = randomToken(32);
  return {
    user: {
      _id: userId,
      name: `Load Student ${index}`,
      // An in-org student address: `deriveRole` grants the student surface to
      // `@student.buksu.edu.ph` and anything else, but the in-org shape keeps
      // the seeded data indistinguishable from production.
      email: `loadtest-${runTag}-${index}@student.buksu.edu.ph`,
      emailVerified: true,
      image: null,
      role: "STUDENT",
      isOutsideOrg: false,
      createdAt: now,
      updatedAt: now,
    },
    session: {
      _id: sessionId,
      token,
      userId,
      ipAddress: "127.0.0.1",
      userAgent: "erpsys-load-test",
      expiresAt: new Date(now.getTime() + SESSION_TTL_MS),
      createdAt: now,
      updatedAt: now,
    },
    profile: {
      _id: profileId,
      userId,
      studentNumber,
      academicYearId: yearId,
    },
    // `joinQueue` reads the course and year level off this record and refuses
    // a caller that names any other department, so a seed without it measures
    // nothing but PRECONDITION_FAILED.
    enrollment: {
      _id: genId("enrollment"),
      studentProfileId: profileId,
      academicYearId: yearId,
      departmentId,
      yearLevel: SEEDED_YEAR_LEVEL,
      createdAt: now,
    },
    userId,
    profileId,
    sessionId,
    token,
  };
}

export async function seed(db, config) {
  const runTag = randomToken(6).toLowerCase();
  const created = {
    runTag,
    users: [],
    sessions: [],
    profiles: [],
    availabilities: [],
    adviserDepartments: [],
    academicYears: [],
    departments: [],
    enrollments: [],
  };

  const { year, department, steps } = await ensureFixtures(db, created);
  await ensureOpenQueue(db, config, created, department._id, year._id);

  // One extra student is the pre-flight probe: it calls `joinQueue` once over
  // HTTP before any sockets open, so a misconfigured seed reports the server's
  // own rejection reason instead of measuring 500 identical 409s.
  const total = config.students + 1;
  const now = new Date();
  const students = [];
  for (let i = 0; i < total; i += 1) {
    students.push(studentDocs(i, runTag, year._id, department._id, now));
  }

  await insertInBatches(
    db.collection(COLLECTIONS.user),
    students.map((s) => s.user),
    config.seedBatch,
  );
  await insertInBatches(
    db.collection(COLLECTIONS.session),
    students.map((s) => s.session),
    config.seedBatch,
  );
  await insertInBatches(
    db.collection(COLLECTIONS.studentProfile),
    students.map((s) => s.profile),
    config.seedBatch,
  );
  await insertInBatches(
    db.collection(COLLECTIONS.studentEnrollment),
    students.map((s) => s.enrollment),
    config.seedBatch,
  );
  created.users.push(...students.map((s) => s.userId));
  created.sessions.push(...students.map((s) => s.sessionId));
  created.profiles.push(...students.map((s) => s.profileId));
  created.enrollments.push(...students.map((s) => s.enrollment._id));

  const verifications = students.flatMap((s) =>
    steps.map((step) => ({
      _id: genId("verification"),
      studentProfileId: s.profileId,
      academicYearId: year._id,
      stepId: String(step._id),
      status: "VERIFIED",
      appliedAt: now,
      verifiedAt: now,
      verifiedById: null,
      evidence: { uploadIds: [] },
    })),
  );
  await insertInBatches(
    db.collection(COLLECTIONS.stepVerification),
    verifications,
    config.seedBatch,
  );

  const [probe, ...rest] = students;
  return {
    runTag,
    year,
    department,
    steps,
    created,
    probe: {
      ...probe,
      cookie: sessionCookieHeader(probe.token, config.authSecret),
    },
    students: rest.map((s) => ({
      userId: s.userId,
      profileId: s.profileId,
      sessionId: s.sessionId,
      cookie: sessionCookieHeader(s.token, config.authSecret),
    })),
  };
}

/**
 * Remove everything the run created, scoped to the ids it minted. Queue rows are
 * removed by `studentProfileId` rather than by `_id` because the server mints
 * those ids, not us — but the filter can only match the profiles this run made.
 */
export async function teardown(db, seeded) {
  const profileIds = [
    seeded.probe.profileId,
    ...seeded.students.map((s) => s.profileId),
  ];
  const userIds = [
    seeded.probe.userId,
    ...seeded.students.map((s) => s.userId),
  ];
  const sessionIds = [
    seeded.probe.sessionId,
    ...seeded.students.map((s) => s.sessionId),
  ];
  const removed = {};

  removed.enrollmentQueue =
    (
      await db
        .collection(COLLECTIONS.enrollmentQueue)
        .deleteMany({ studentProfileId: { $in: profileIds } })
    ).deletedCount ?? 0;
  removed.notification =
    (
      await db
        .collection(COLLECTIONS.notification)
        .deleteMany({ userId: { $in: userIds } })
    ).deletedCount ?? 0;
  removed.stepVerification =
    (
      await db
        .collection(COLLECTIONS.stepVerification)
        .deleteMany({ studentProfileId: { $in: profileIds } })
    ).deletedCount ?? 0;
  removed.studentEnrollment =
    (
      await db
        .collection(COLLECTIONS.studentEnrollment)
        .deleteMany({ studentProfileId: { $in: profileIds } })
    ).deletedCount ?? 0;
  removed.studentProfile =
    (
      await db
        .collection(COLLECTIONS.studentProfile)
        .deleteMany({ _id: { $in: profileIds } })
    ).deletedCount ?? 0;
  removed.session =
    (
      await db
        .collection(COLLECTIONS.session)
        .deleteMany({ _id: { $in: sessionIds } })
    ).deletedCount ?? 0;
  removed.user =
    (
      await db
        .collection(COLLECTIONS.user)
        .deleteMany({ _id: { $in: userIds } })
    ).deletedCount ?? 0;

  if (seeded.created.adviserDepartments.length > 0) {
    removed.adviserDepartment =
      (
        await db
          .collection(COLLECTIONS.adviserDepartment)
          .deleteMany({ _id: { $in: seeded.created.adviserDepartments } })
      ).deletedCount ?? 0;
  }
  if (seeded.created.availabilities.length > 0) {
    removed.adviserAvailability =
      (
        await db
          .collection(COLLECTIONS.adviserAvailability)
          .deleteMany({ _id: { $in: seeded.created.availabilities } })
      ).deletedCount ?? 0;
  }
  if (seeded.created.departments.length > 0) {
    removed.department =
      (
        await db
          .collection(COLLECTIONS.department)
          .deleteMany({ _id: { $in: seeded.created.departments } })
      ).deletedCount ?? 0;
  }
  if (seeded.created.academicYears.length > 0) {
    removed.academicYear =
      (
        await db
          .collection(COLLECTIONS.academicYear)
          .deleteMany({ _id: { $in: seeded.created.academicYears } })
      ).deletedCount ?? 0;
  }

  return removed;
}
