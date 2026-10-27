import type { MyStepsData } from "./types.js";

export function shouldGateOnboarding(args: {
  data: MyStepsData | undefined;
  role: string;
  dismissed: boolean;
}): boolean {
  const { data, role, dismissed } = args;
  if (role !== "STUDENT") return false;
  if (!data) return false;
  if (dismissed) return false;

  const enrolledThisYear = data.hasActiveYear
    ? (data.profile.enrollments as any[]).some(
        (record) => record.academicYearId === data.academicYearId,
      )
    : Boolean(data.profile.enrollment);
  const missingEnrollment = !enrolledThisYear;
  const missingNumber =
    !data.profile.studentNumber && !data.profile.derivedStudentNumber;
  return missingEnrollment || missingNumber;
}
