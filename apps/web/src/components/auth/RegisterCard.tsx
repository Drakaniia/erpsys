import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { useForm } from "@tanstack/react-form";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { authClient, signUpStudent } from "$lib/auth-client";
import { api } from "$lib/api";
import { YEAR_LEVELS } from "$lib/domain/constants";
import {
  NO_ACADEMIC_YEAR_MESSAGE,
  defaultAcademicYearId,
  isEnrollmentOpen,
} from "$lib/auth/register-placement";
import {
  confirmPasswordSchema,
  emailSchema,
  firstErrorMessage,
  nameSchema,
  passwordSchema,
  placementSchemaFor,
  studentNumberSchema,
} from "./register-schemas";
import AcademicYearSelect from "./AcademicYearSelect";
import AuthField from "./AuthField";
import CourseYearPicker from "./CourseYearPicker";
import FieldErrors from "./FieldErrors";
import GoogleIcon from "./GoogleIcon";
import Turnstile, { type TurnstileHandle } from "./Turnstile";
import { useIntegrations } from "$lib/integrations/use-integrations";
import { env } from "$lib/env";

export default function RegisterCard() {
  const navigate = useNavigate();

  const optionsQuery = useQuery(
    api.options.getSignupOptions.queryOptions({
      staleTime: 5 * 60 * 1000,
      refetchOnWindowFocus: false,
    }),
  );
  const signupOptions = optionsQuery.data;
  const optionsLoading = optionsQuery.isPending;
  const enrollmentOpen = isEnrollmentOpen(signupOptions);

  const [formError, setFormError] = useState("");
  const [turnstileToken, setTurnstileToken] = useState("");
  const turnstileRef = useRef<TurnstileHandle | null>(null);
  const turnstileSiteKey = env.VITE_TURNSTILE_SITE_KEY ?? "";
  const { flags } = useIntegrations();
  const showGoogle = flags.googleAuth;
  const turnstileEnabled =
    flags.turnstile && turnstileSiteKey.trim().length > 0;

  function handleTurnstileExpire() {
    setTurnstileToken("");
    setFormError("Verification expired — please complete the challenge again.");
  }

  function handleTurnstileError() {
    setTurnstileToken("");
    setFormError(
      "Verification failed. Click Retry and complete the challenge again.",
    );
  }

  const form = useForm({
    defaultValues: {
      name: "",
      studentNumber: "",
      academicYearId: "",
      departmentId: "",
      yearLevel: "",
      email: "",
      password: "",
      confirmPassword: "",
    },
    onSubmit: async ({ value, formApi }) => {
      setFormError("");
      const placement = placementSchemaFor(signupOptions);
      const schema = z
        .object({
          name: nameSchema,
          studentNumber: studentNumberSchema,
          email: emailSchema,
          password: passwordSchema,
          confirmPassword: confirmPasswordSchema,
          academicYearId: placement.academicYearId,
          departmentId: placement.departmentId,
          yearLevel: placement.yearLevel,
        })
        .refine((v) => v.password === v.confirmPassword, {
          message: "Passwords do not match",
          path: ["confirmPassword"],
        });
      const parsed = schema.safeParse(value);
      if (!parsed.success) {
        for (const issue of parsed.error.issues) {
          const name = issue.path[0] as keyof typeof value;
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
      if (turnstileEnabled && !turnstileToken) {
        setFormError("Please complete the verification challenge.");
        return;
      }
      const result = await signUpStudent({
        name: value.name,
        studentNumber: value.studentNumber.trim(),
        academicYearId: value.academicYearId,
        departmentId: value.departmentId,
        yearLevel: value.yearLevel as (typeof YEAR_LEVELS)[number],
        email: value.email,
        password: value.password,
        "cf-turnstile-response": turnstileToken,
      });
      if (result.error) {
        setFormError(
          result.error.message || "Registration failed. Please try again.",
        );
        try {
          turnstileRef.current?.reset();
        } catch {
          /* ignore */
        }
        setTurnstileToken("");
        return;
      }
      try {
        turnstileRef.current?.reset();
      } catch {
        /* ignore */
      }
      setTurnstileToken("");
      navigate(`/loading?message=Creating+your+account…`);
    },
  });

  // Preselect the activated academic year once the catalogue arrives (a
  // React form is created once, unlike the rune form's defaultValues getter).
  useEffect(() => {
    if (!signupOptions) return;
    const def = defaultAcademicYearId(signupOptions);
    if (def && !form.getFieldValue("academicYearId")) {
      form.setFieldValue("academicYearId", def);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signupOptions]);

  // Set on press and left on through the OAuth redirect (the page
  // unloads). Reset only if the redirect never happens.
  const [googleBusy, setGoogleBusy] = useState(false);

  async function signInWithGoogle() {
    if (googleBusy) return;
    setGoogleBusy(true);
    try {
      await authClient.signIn.social({ provider: "google", callbackURL: "/" });
    } catch {
      setGoogleBusy(false);
    }
  }

  return (
    <div className="w-full">
      <div>
        <h1 className="text-[30px] leading-[1.1] font-bold tracking-[-0.03em] text-auth-ink">
          Create your student account
        </h1>
        <p className="mt-1.5 text-sm leading-relaxed text-muted">
          For students without an institutional email — have your student number
          ready.
        </p>

        <form
          className="mt-7 space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            e.stopPropagation();
            void form.handleSubmit();
          }}
        >
          <form.Field name="name">
            {(field) => (
              <AuthField
                field={field}
                label="Full name"
                autocomplete="name"
                placeholder="DIGAL JOHN PAUL"
                onedit={() => setFormError("")}
              />
            )}
          </form.Field>

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

          <form.Field name="email">
            {(field) => (
              <AuthField
                field={field}
                label="Email"
                type="email"
                autocomplete="email"
                placeholder="you@gmail.com"
                onedit={() => setFormError("")}
              />
            )}
          </form.Field>

          <form.Field name="password">
            {(field) => (
              <AuthField
                field={field}
                label="Password"
                type="password"
                autocomplete="new-password"
                hint="At least 8 characters"
                onedit={() => setFormError("")}
              />
            )}
          </form.Field>

          <form.Field name="confirmPassword">
            {(field) => (
              <AuthField
                field={field}
                label="Confirm password"
                type="password"
                autocomplete="new-password"
                onedit={() => setFormError("")}
              />
            )}
          </form.Field>

          {turnstileEnabled ? (
            <Turnstile
              ref={turnstileRef}
              sitekey={turnstileSiteKey}
              action="signup"
              onToken={(t) => {
                setTurnstileToken(t);
                if (t) setFormError("");
              }}
              onExpire={handleTurnstileExpire}
              onError={handleTurnstileError}
            />
          ) : null}

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
                {isSubmitting ? "Creating account…" : "Create account"}
              </button>
            )}
          </form.Subscribe>
        </form>

        {showGoogle ? (
          <>
            <div className="mt-7 flex items-center gap-3 text-[13px] text-muted">
              <span className="h-px flex-1 bg-auth-border" />
              Or sign in with
              <span className="h-px flex-1 bg-auth-border" />
            </div>

            <button
              type="button"
              onClick={() => void signInWithGoogle()}
              className="auth-btn-secondary mt-4"
              disabled={googleBusy}
              aria-busy={googleBusy}
            >
              {googleBusy ? (
                <>
                  <span
                    className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent opacity-70 motion-reduce:animate-none"
                    aria-hidden="true"
                  />
                  Connecting…
                </>
              ) : (
                <>
                  <GoogleIcon />
                  Google
                </>
              )}
            </button>
          </>
        ) : null}

        <p className="mt-6 text-center text-[13px] text-muted">
          Already have an account?{" "}
          <Link
            to="/login"
            className="font-semibold text-auth-blue transition-opacity duration-140 hover:opacity-80"
          >
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
