import { z } from "zod";
import { STUDENT_NUMBER_PATTERN, YEAR_LEVELS } from "$lib/domain/constants";
import type { SignupOptions } from "$lib/auth/register-placement";

const INSTITUTIONAL_DOMAIN = "@student.buksu.edu.ph";

export const nameSchema = z.string().min(1, "Name is required");
export const studentNumberSchema = z
  .string()
  .trim()
  .min(1, "Student number is required")
  .regex(
    STUDENT_NUMBER_PATTERN,
    "Only letters, numbers, and dashes are allowed (numbers can be any length)",
  );
export const emailSchema = z
  .email("Invalid email address")
  .refine((value) => !value.toLowerCase().endsWith(INSTITUTIONAL_DOMAIN), {
    message: "Institutional accounts sign in with Google instead.",
  });
export const passwordSchema = z.string().min(8, "At least 8 characters");
export const confirmPasswordSchema = z.string().min(1, "Confirm your password");

/**
 * The placement validators, strict against the loaded catalogue: unlike
 * `makePlacementSchema` (which accepts anything while the catalogue is empty),
 * these require the chosen id to exist. Both callers guard on
 * `isEnrollmentOpen` before submitting, so the empty-catalogue case is handled
 * by that message rather than by these refinements.
 */
export function placementSchemaFor(signupOptions: SignupOptions | undefined) {
  const yearIds = new Set(
    ((signupOptions?.academicYears ?? []) as { id: string }[]).map((y) => y.id),
  );
  const departmentIds = new Set(
    ((signupOptions?.departments ?? []) as { id: string }[]).map((d) => d.id),
  );
  return {
    academicYearId: z
      .string()
      .min(1, "Choose an academic year")
      .refine((v) => yearIds.has(v), "Choose an academic year from the list"),
    departmentId: z
      .string()
      .min(1, "Choose your course")
      .refine((v) => departmentIds.has(v), "Choose a course from the list"),
    yearLevel: z.enum(YEAR_LEVELS, { message: "Choose your year level" }),
  };
}

/** The first zod error on a field, whether it is a string or an issue object. */
export function firstErrorMessage(field: {
  state: { meta: { errors: any[] } };
}): string | null {
  const first = field.state.meta.errors[0];
  if (!first) return null;
  return typeof first === "string" ? first : (first.message ?? null);
}
