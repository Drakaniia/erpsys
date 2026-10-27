import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { useForm } from "@tanstack/react-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import {
  STUDENT_NUMBER_PATTERN,
  YEAR_LEVELS,
  deriveStudentNumberFromEmail,
} from "$lib/domain/constants";
import { api } from "$lib/api";
import { authClient } from "$lib/auth-client";
import {
  NO_ACADEMIC_YEAR_MESSAGE,
  defaultAcademicYearId,
  isEnrollmentOpen,
} from "$lib/auth/register-placement";
import { COMPLETION_DEST_KEY, isInternalPath } from "$lib/auth/completion-gate";
import { firstErrorMessage, placementSchemaFor } from "./register-schemas";
import AcademicYearSelect from "./AcademicYearSelect";
import AuthField from "./AuthField";
import CourseYearPicker from "./CourseYearPicker";
import FieldErrors from "./FieldErrors";

export default function CompleteProfileCard() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [params] = useSearchParams();

  const optionsQuery = useQuery(
    api.options.getSignupOptions.queryOptions({
      staleTime: 5 * 60 * 1000,
      refetchOnWindowFocus: false,
    }),
  );
  const signupOptions = optionsQuery.data;
  const optionsLoading = optionsQuery.isPending;
  const enrollmentOpen = isEnrollmentOpen(signupOptions);

  const studentNumberSchema = z
    .string()
    .trim()
    .min(1, "Student number is required")
    .regex(STUDENT_NUMBER_PATTERN, "Only numbers are allowed");

  const sessionQuery = authClient.useSession();
  const sessionEmail =
    (sessionQuery.data?.user as { email?: string } | undefined)?.email ?? "";
  const derivedNumber = deriveStudentNumberFromEmail(sessionEmail);

  const [formError, setFormError] = useState("");

  const saveMutation = useMutation(
    api.student.saveEnrollment.mutationOptions(),
  );

  const form = useForm({
    defaultValues: {
      studentNumber: "",
      academicYearId: "",
      departmentId: "",
      yearLevel: "",
    },
    onSubmit: async ({ value, formApi }) => {
      setFormError("");
      // Validate against the loaded catalogue, surfacing per-field errors the
      // same way the Svelte form's `validators.onSubmit` did.
      const placement = placementSchemaFor(signupOptions);
      const schema = z.object({
        studentNumber: derivedNumber ? z.string() : studentNumberSchema,
        academicYearId: placement.academicYearId,
        departmentId: placement.departmentId,
        yearLevel: placement.yearLevel,
      });
      const parsed = schema.safeParse(value);
      if (!parsed.success) {
        for (const issue of parsed.error.issues) {
          const name = issue.path[0] as
            | "studentNumber"
            | "academicYearId"
            | "departmentId"
            | "yearLevel";
          formApi.setFieldMeta(name, (prev) => ({
            ...prev,
            errors: [issue.message],
          }));
        }
        return;
      }
      if (!enrollmentOpen) {
        setFormError(NO_ACADEMIC_YEAR_MESSAGE);
        return;
      }
      try {
        await saveMutation.mutateAsync({
          ...(derivedNumber
            ? {}
            : { studentNumber: value.studentNumber.trim() }),
          academicYearId: value.academicYearId,
          departmentId: value.departmentId,
          yearLevel: value.yearLevel as (typeof YEAR_LEVELS)[number],
        });
      } catch (e) {
        setFormError(
          (e as { message?: string }).message ??
            "Could not save your details. Please try again.",
        );
        return;
      }

      await queryClient.invalidateQueries({ queryKey: ["student"] });

      let dest: string | null = null;
      try {
        const stored = sessionStorage.getItem(COMPLETION_DEST_KEY);
        if (isInternalPath(stored)) dest = stored;
        sessionStorage.removeItem(COMPLETION_DEST_KEY);
      } catch {
        /* storage unavailable */
      }
      if (!dest) dest = params.get("dest");
      if (!isInternalPath(dest)) dest = null;

      navigate(
        dest
          ? `/loading?dest=${encodeURIComponent(dest)}&message=Setting+up+your+account…`
          : `/loading?message=Setting+up+your+account…`,
      );
    },
  });

  // Preselect the year the admin activated, once the catalogue arrives — same
  // helper the register form and the onboarding modal use, so all three
  // placement pickers agree. (The rune form re-ran its defaultValues getter;
  // a React form is created once, so the default lands here.)
  useEffect(() => {
    if (!signupOptions) return;
    const def = defaultAcademicYearId(signupOptions);
    if (def && !form.getFieldValue("academicYearId")) {
      form.setFieldValue("academicYearId", def);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signupOptions]);

  return (
    <div className="w-full">
      <div>
        <h1 className="text-[30px] leading-[1.1] font-bold tracking-[-0.03em] text-auth-ink">
          Finish setting up your account
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          {derivedNumber
            ? "Add your course and year level so your instructors can find you."
            : "You're signed in. Add your student number, course, and year level so your instructors can find you."}
        </p>

        <form
          className="auth-section space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            e.stopPropagation();
            void form.handleSubmit();
          }}
        >
          {derivedNumber ? (
            <div className="space-y-2">
              <span className="auth-label">Student number</span>
              <p
                className="auth-input flex items-center justify-between tabular-nums"
                data-testid="derived-student-number"
              >
                <span>{derivedNumber}</span>
                <span className="text-xs font-normal text-muted">
                  from your email address
                </span>
              </p>
            </div>
          ) : (
            <form.Field name="studentNumber">
              {(field) => (
                <AuthField
                  field={field}
                  label="Student number"
                  autocomplete="off"
                  placeholder="e.g. 2401117979"
                  onedit={() => setFormError("")}
                />
              )}
            </form.Field>
          )}

          {!optionsLoading && !enrollmentOpen ? (
            <p className="auth-alert" role="alert">
              {NO_ACADEMIC_YEAR_MESSAGE}
            </p>
          ) : (
            <>
              <form.Field name="academicYearId">
                {(field) => {
                  const hasError = field.state.meta.errors.length > 0;
                  return (
                    <div className="space-y-2">
                      <AcademicYearSelect
                        id={field.name}
                        label="Academic year"
                        value={field.state.value}
                        options={signupOptions?.academicYears ?? []}
                        loading={optionsLoading}
                        invalid={hasError}
                        describedBy={
                          hasError ? `${field.name}-error` : undefined
                        }
                        onblur={field.handleBlur}
                        onselect={(yearId) => {
                          field.handleChange(yearId);
                          field.setMeta((prev) => ({
                            ...prev,
                            errors: [],
                            isTouched: false,
                          }));
                          setFormError("");
                        }}
                      />
                      <FieldErrors field={field} id={`${field.name}-error`} />
                    </div>
                  );
                }}
              </form.Field>

              <form.Field name="departmentId">
                {(courseField) => (
                  <form.Field name="yearLevel">
                    {(levelField) => (
                      <div className="space-y-2">
                        <CourseYearPicker
                          id="course-year"
                          label="Course & year level"
                          departmentId={courseField.state.value}
                          yearLevel={levelField.state.value}
                          options={signupOptions}
                          loading={optionsLoading}
                          error={firstErrorMessage(courseField)}
                          levelError={firstErrorMessage(levelField)}
                          onselect={(value) => {
                            courseField.handleChange(value.departmentId);
                            levelField.handleChange(value.yearLevel);
                            courseField.setMeta((prev) => ({
                              ...prev,
                              errors: [],
                              isTouched: false,
                            }));
                            levelField.setMeta((prev) => ({
                              ...prev,
                              errors: [],
                              isTouched: false,
                            }));
                            setFormError("");
                          }}
                        />
                        <FieldErrors field={courseField} />
                        <FieldErrors field={levelField} />
                      </div>
                    )}
                  </form.Field>
                )}
              </form.Field>
            </>
          )}

          {formError ? (
            <p className="auth-alert" role="alert" aria-live="polite">
              {formError}
            </p>
          ) : null}

          <form.Subscribe selector={(state) => state.isSubmitting}>
            {(isSubmitting) => (
              <button
                type="submit"
                className="auth-btn-primary"
                disabled={isSubmitting}
              >
                {isSubmitting ? "Saving…" : "Save and continue"}
              </button>
            )}
          </form.Subscribe>
        </form>
      </div>
    </div>
  );
}
