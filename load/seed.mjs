import { createHmac, randomUUID } from "node:crypto";
import { assertEmptyDatabase } from "./safety.mjs";
import { loadStepCatalog } from "./step-catalog.mjs";

export const COLLECTIONS = {
  user: "user", session: "session", academicYear: "academic_year",
  studentEnrollment: "student_enrollment", stepVerification: "step_verification",
  department: "department", adviserSchedule: "adviser_schedule",
  enrollmentQueue: "enrollment_queue", notification: "notification",
};
export const SESSION_COOKIE_NAME = "better-auth.session_token";
export const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
export function signSessionToken(token, secret) {
  return `${token}.${createHmac("sha256", secret).update(token).digest("base64")}`;
}
export function sessionCookieHeader(token, secret) {
  return `${SESSION_COOKIE_NAME}=${encodeURIComponent(signSessionToken(token, secret))}`;
}
const id = (prefix) => `${prefix}-${randomUUID()}`;

export function buildFixtures(config, steps, now = new Date()) {
  const runTag = randomUUID();
  const year = { _id: id("ay"), label: `Load ${runTag}`, semesterLabel: "First Semester", isActive: true, createdAt: now };
  const adviser = { _id: id("user"), name: "Load Adviser", email: `load-${runTag}@buksu.edu.ph`, emailVerified: true, role: "ENROLLMENT_ADVISER", createdAt: now, updatedAt: now };
  const department = { _id: id("department"), name: `Load ${runTag}`, isActive: true, yearLevels: ["SECOND"], advisers: [{ adviserId: adviser._id, yearLevels: ["SECOND"], createdAt: now }] };
  const presence = { _id: id("schedule"), kind: "presence", adviserId: adviser._id, departmentId: department._id, academicYearId: year._id, isOpen: true, lastActiveAt: now, createdAt: now, updatedAt: now };
  const students = Array.from({ length: config.students + 1 }, (_, index) => {
    const userId = id("user");
    const profileId = id("profile");
    const sessionId = id("session");
    const token = randomUUID() + randomUUID();
    const studentNumber = `${BigInt(`0x${randomUUID().replaceAll("-", "")}`)}`;
    const profile = { _id: profileId, studentNumber, academicYearId: year._id, createdAt: now, updatedAt: now };
    return {
      userId, profileId, sessionId, token,
      cookie: sessionCookieHeader(token, config.authSecret),
      user: { _id: userId, name: `Load Student ${index}`, email: `${studentNumber}@student.buksu.edu.ph`, emailVerified: true, role: "STUDENT", isOutsideOrg: false, studentProfile: profile, createdAt: now, updatedAt: now },
      session: { _id: sessionId, token, userId, expiresAt: new Date(now.getTime() + SESSION_TTL_MS), createdAt: now, updatedAt: now, ipAddress: "127.0.0.1", userAgent: "erpsys-load-test" },
      enrollment: { _id: id("enrollment"), studentProfileId: profileId, academicYearId: year._id, departmentId: department._id, yearLevel: "SECOND", createdAt: now },
    };
  });
  const records = {
    academicYear: [year], department: [department], adviserSchedule: [presence],
    user: [adviser, ...students.map((student) => student.user)],
    session: students.map((student) => student.session),
    studentEnrollment: students.map((student) => student.enrollment),
    stepVerification: students.flatMap((student) => steps.map((step) => ({ _id: id("verification"), studentProfileId: student.profileId, academicYearId: year._id, stepId: step._id, status: "VERIFIED", appliedAt: now, verifiedAt: now, verifiedById: adviser._id, evidence: { uploadIds: [] } }))),
  };
  const [probe, ...rest] = students;
  return { runTag, year, department, steps, records, probe, students: rest };
}

export async function seed(db, config, catalog = loadStepCatalog) {
  await assertEmptyDatabase(db, config);
  const steps = await catalog();
  if (!Array.isArray(steps) || steps.length === 0 || steps.some((step) => step._id !== step.code)) throw new Error("Invalid server step definitions");
  const seeded = buildFixtures(config, steps);
  try {
    for (const [key, docs] of Object.entries(seeded.records)) {
      for (let offset = 0; offset < docs.length; offset += config.seedBatch) {
        await db.collection(COLLECTIONS[key]).insertMany(docs.slice(offset, offset + config.seedBatch));
      }
    }
    return seeded;
  } catch (error) {
    await teardown(db, seeded);
    throw error;
  }
}

export async function teardown(db, seeded) {
  const removed = {};
  const profileIds = [seeded.probe, ...seeded.students].map((student) => student.profileId);
  const userIds = seeded.records.user.map((user) => user._id);
  for (const key of ["enrollmentQueue", "stepVerification", "studentEnrollment"]) {
    removed[key] = (await db.collection(COLLECTIONS[key]).deleteMany({ studentProfileId: { $in: profileIds }, academicYearId: seeded.year._id })).deletedCount;
  }
  removed.notification = (await db.collection(COLLECTIONS.notification).deleteMany({ userId: { $in: userIds } })).deletedCount;
  for (const [key, docs] of Object.entries(seeded.records).reverse()) {
    removed[key] = (removed[key] ?? 0) + (await db.collection(COLLECTIONS[key]).deleteMany({ _id: { $in: docs.map((doc) => doc._id) } })).deletedCount;
  }
  return removed;
}
