import {
  STEP_CODES,
  STEP_NAMES,
  type StepCode,
} from "../src/lib/domain/constants";
import type { AdminOverview } from "../src/lib/admin/overview";
import { campusNow } from "./format";

export const year = {
  id: "term",
  label: "2026–2027",
  semesterLabel: "1st Semester",
  isActive: true,
};
export const course = {
  id: "it",
  code: "BSIT",
  name: "Information Technology",
  yearLevels: ["FIRST", "SECOND", "THIRD", "FOURTH"],
  myYearLevels: ["FIRST", "SECOND"],
  isOpen: true,
  myOpen: true,
};
export const ago = (minutes: number) =>
  new Date(campusNow - minutes * 60000).toISOString();
const names = [
  "Mara Reyes",
  "Iris Tan",
  "Luis Flores",
  "Tala Garcia",
  "Enzo Ramos",
  "Nina Diaz",
];
export const people = names.map((name, i) => ({
  name,
  studentNumber: String(2601041 + i),
  email: `student${i + 1}@example.invalid`,
  image: null,
}));
const placement = {
  academicYearId: year.id,
  departmentId: course.id,
  departmentName: course.name,
  yearLevel: "FIRST",
};
export function record(phase: "draft" | "submitted" | "cleared" | "enrolled") {
  const steps = STEP_CODES.map((code, i) => {
    const pending =
      code === "ENROLLMENT"
        ? phase !== "enrolled"
        : code === "PROFILING" && (phase === "draft" || phase === "submitted");
    const status = !pending
      ? "VERIFIED"
      : code === "PROFILING" && phase === "submitted"
        ? "SUBMITTED"
        : "PENDING";
    const ready = code === "ENROLLMENT" && phase === "cleared";
    return {
      code,
      name: STEP_NAMES[code],
      order: i + 1,
      status,
      evidence: [],
      reply: null,
      hint: !pending
        ? "Verified by " + (code === "ENROLLMENT" ? "Noel Santos" : "Lia Cruz")
        : code === "ENROLLMENT"
          ? ready
            ? "Join the queue"
            : "Complete the first 5 steps"
          : status === "SUBMITTED"
            ? "Awaiting officer review"
            : "Complete the form",
      chip: {
        label: !pending
          ? "Verified"
          : ready
            ? "Ready"
            : status === "SUBMITTED"
              ? "Submitted"
              : "Pending",
        tone: !pending
          ? "success"
          : ready || status === "SUBMITTED"
            ? "info"
            : "muted",
      },
      profilingFormUrl:
        code === "PROFILING" ? "https://example.invalid/profiling" : null,
    };
  });
  return {
    steps,
    hasActiveYear: true,
    academicYearId: year.id,
    academicYearLabel: year.label,
    semesterLabel: year.semesterLabel,
    profile: {
      studentNumber: people[0]!.studentNumber,
      enrollment: placement,
      enrollments: [placement],
    },
  };
}
export const entries = people.slice(0, 4).map((p, i) => ({
  ...p,
  entryId: `entry-${i}`,
  joinedAt: ago(4 - i),
  yearLevel: i % 2 ? "SECOND" : "FIRST",
  verifiedSteps: 5,
  missingStepNames: [],
  locked: false,
}));
export function register(verified: boolean) {
  const data = people.map((student, i) => ({
    student,
    verificationId: `review-${i}`,
    submittedAt: ago(i * 3 + 1),
    status:
      i === 0
        ? verified
          ? "VERIFIED"
          : "SUBMITTED"
        : i === 2
          ? "RETURNED"
          : i < 4
            ? "SUBMITTED"
            : "VERIFIED",
    evidence: [],
    evidenceCount: 0,
  }));
  return {
    data,
    total: data.length,
    pageSize: 50,
    verifiedCount: verified ? 3 : 2,
    unverifiedCount: verified ? 3 : 4,
  };
}
export const detail = {
  student: people[0]!,
  step: { code: "PROFILING" as StepCode, name: "Profiling" },
  submittedAt: ago(1),
  evidence: [],
  answers: [
    { label: "Student name", value: "Mara Reyes" },
    { label: "Course", value: course.name },
    { label: "Year level", value: "1st Year" },
  ],
};
export const overview: AdminOverview = {
  activeYear: year,
  roleCounts: { STUDENT: 208, SBO_OFFICER: 5, ENROLLMENT_ADVISER: 8, ADMIN: 2 },
  stepTotals: STEP_CODES.slice(0, 5).map((code, i) => ({
    code,
    name: STEP_NAMES[code],
    order: i + 1,
    verified: [184, 179, 166, 174, 173][i]!,
    unverified: [6, 8, 21, 9, 7][i]!,
  })),
  departmentTallies: [
    {
      departmentId: "it",
      code: "BSIT",
      name: course.name,
      waiting: 3,
      serving: 1,
      enrolled: 69,
    },
    {
      departmentId: "et",
      code: "BSET",
      name: "Electronics Technology",
      waiting: 4,
      serving: 1,
      enrolled: 35,
    },
    {
      departmentId: "ft",
      code: "BSFT",
      name: "Food Technology",
      waiting: 2,
      serving: 1,
      enrolled: 24,
    },
  ],
  recentActivity: [],
  queueTrend: Array.from({ length: 14 }, (_, i) => ({
    day: `2026-08-${String(i + 4).padStart(2, "0")}`,
    joined: [4, 6, 8, 10, 9, 12, 15, 7, 10, 12, 11, 14, 13, 12][i]!,
    completed: [3, 4, 6, 8, 8, 10, 12, 6, 9, 11, 11, 12, 17, 11][i]!,
  })),
};
