import { YEAR_LEVEL_LABELS, type YearLevel } from "$lib/domain/constants";

export type ProfileEnrollmentRecord = {
  academicYearId: string;
  academicYearLabel: string;
  semesterLabel: string;
  departmentName: string;
  departmentCode: string;
  yearLevel: YearLevel;
};

export function isEditableEnrollment(
  record: Pick<ProfileEnrollmentRecord, "academicYearId">,
  activeYearId: string | null,
): boolean {
  return activeYearId !== null && record.academicYearId === activeYearId;
}

export function profileEnrollmentCourse(
  record: Pick<ProfileEnrollmentRecord, "departmentName" | "departmentCode">,
): string {
  if (!record.departmentName) return record.departmentCode || "Unassigned";
  return record.departmentCode
    ? `${record.departmentName} (${record.departmentCode})`
    : record.departmentName;
}

export function profileEnrollmentYear(
  record: Pick<ProfileEnrollmentRecord, "academicYearLabel" | "semesterLabel">,
): string {
  return [record.academicYearLabel, record.semesterLabel]
    .filter(Boolean)
    .join(" · ");
}

export function profileEnrollmentLevel(
  record: Pick<ProfileEnrollmentRecord, "yearLevel">,
): string {
  return YEAR_LEVEL_LABELS[record.yearLevel];
}
