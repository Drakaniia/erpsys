import { z } from "zod";
import {
  YEAR_LEVELS,
  departmentAcceptsLevel,
  type YearLevel,
} from "$lib/domain/constants";

export type AcademicYearOption = {
  id: string;
  label: string;
  semesterLabel: string;
  isActive: boolean;
};

export type DepartmentOption = {
  id: string;
  name: string;
  code: string;
  yearLevels: YearLevel[];
};

export type SignupOptions = {
  academicYears: AcademicYearOption[];
  departments: DepartmentOption[];
};

export const NO_ACADEMIC_YEAR_MESSAGE =
  "Enrollment is not open yet — no academic year is configured. Please contact the SBO office.";

export function isEnrollmentOpen(options: SignupOptions | undefined): boolean {
  return (options?.academicYears?.length ?? 0) > 0;
}

export function academicYearOptionLabel(option: AcademicYearOption): string {
  return `${option.label} · ${option.semesterLabel}`;
}

/**
 * The academic year to preselect: the one the admin activated, else
 * the first configured.
 *
 * Three surfaces need this and all three are a placement picker -
 * register, complete-profile, and the onboarding modal. When each
 * carried its own copy they drifted, and only the modal preselected
 * anything, so a registering student was asked to choose what the
 * admin had already decided.
 *
 * Index 0 is NOT a safe primary: the list is not ordered
 * "current first", so it is only a fallback for the window between
 * "a year is configured" and "the admin activates it".
 */
export function defaultAcademicYearId(
  options: SignupOptions | undefined | null,
): string | null {
  const years = options?.academicYears ?? [];
  if (years.length === 0) return null;
  return years.find((y) => y.isActive)?.id ?? years[0]!.id;
}

export function departmentOptionLabel(option: DepartmentOption): string {
  return option.name;
}

export function departmentStaffLabel(option: DepartmentOption): string {
  return `${option.name} (${option.code})`;
}

export function offeredYearLevels(
  option: DepartmentOption | undefined,
): readonly YearLevel[] {
  if (!option || option.yearLevels.length === 0) return YEAR_LEVELS;
  return option.yearLevels;
}

export function isLevelOffered(
  option: DepartmentOption | undefined,
  level: YearLevel,
): boolean {
  return departmentAcceptsLevel(option?.yearLevels ?? [], level);
}

export function findDepartmentOption(
  options: SignupOptions | undefined,
  departmentId: string,
): DepartmentOption | undefined {
  return options?.departments.find((d) => d.id === departmentId);
}

export function makePlacementSchema(options: SignupOptions | undefined) {
  const yearIds = new Set(options?.academicYears.map((y) => y.id) ?? []);
  const departmentIds = new Set(options?.departments.map((d) => d.id) ?? []);

  return {
    academicYearId: z
      .string()
      .min(1, "Choose an academic year")
      .refine(
        (value) => yearIds.size === 0 || yearIds.has(value),
        "Choose an academic year from the list",
      ),
    departmentId: z
      .string()
      .min(1, "Choose your course")
      .refine(
        (value) => departmentIds.size === 0 || departmentIds.has(value),
        "Choose a course from the list",
      ),
    yearLevel: z.enum(YEAR_LEVELS, { message: "Choose your year level" }),
  };
}
