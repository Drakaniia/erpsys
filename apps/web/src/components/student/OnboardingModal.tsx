import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  STUDENT_NUMBER_PATTERN,
  YEAR_LEVELS,
  YEAR_LEVEL_LABELS,
} from "$lib/domain/constants";
import {
  defaultAcademicYearId,
  departmentOptionLabel,
  findDepartmentOption,
  isLevelOffered,
  NO_ACADEMIC_YEAR_MESSAGE,
} from "$lib/auth/register-placement";
import AcademicYearSelect from "../auth/AcademicYearSelect";
import CourseYearPicker from "../auth/CourseYearPicker";
import { notify } from "$lib/notifications";
import { api, queryClient } from "$lib/api";
import type { MyStepsData } from "$lib/student/types";

export default function OnboardingModal({
  data,
  mode = "gate",
  onclose,
}: {
  data: MyStepsData;
  mode?: "gate" | "edit";
  onclose?: () => void;
}) {
  const hardGate = mode === "gate";
  const optionsQuery = useQuery(
    api.options.getSignupOptions.queryOptions({
      staleTime: 5 * 60 * 1000,
      refetchOnWindowFocus: false,
    }),
  );
  const options = optionsQuery.data as
    | {
        academicYears: {
          id: string;
          label: string;
          semesterLabel: string;
          isActive: boolean;
        }[];
        departments: {
          id: string;
          name: string;
          code: string;
          yearLevels: string[];
        }[];
      }
    | undefined;
  const optionsLoading = optionsQuery.isPending;
  const hasActiveYear = data.hasActiveYear as boolean;
  const noYearConfigured =
    !optionsLoading && (options?.academicYears.length ?? 0) === 0;
  const [studentNumber, setStudentNumber] = useState("");
  const [academicYearId, setAcademicYearId] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [yearLevel, setYearLevel] = useState("");
  const initialized = useRef(false);
  useEffect(() => {
    if (initialized.current || !options) return;
    const defaultYearId = defaultAcademicYearId(options as never);
    if (defaultYearId && !academicYearId) {
      setAcademicYearId(
        (data.profile.enrollment as { academicYearId?: string } | null)
          ?.academicYearId ?? defaultYearId,
      );
    }
    const existing = data.profile.enrollment as {
      departmentId: string;
      yearLevel: string;
    } | null;
    if (existing) {
      setDepartmentId((prev) => prev || existing.departmentId);
      setYearLevel((prev) => prev || existing.yearLevel);
    }
    initialized.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options]);
  const needsStudentNumber = !data.profile.studentNumber;
  const derivedNumber = needsStudentNumber
    ? (data.profile.derivedStudentNumber as string | null)
    : null;
  const showNumberField = needsStudentNumber && !derivedNumber;
  const [touched, setTouched] = useState({
    studentNumber: false,
    academicYearId: false,
    departmentId: false,
    yearLevel: false,
  });
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const numberValid =
    !showNumberField || STUDENT_NUMBER_PATTERN.test(studentNumber.trim());
  const ayValid = Boolean(academicYearId);
  const courseValid = Boolean(departmentId);
  const selectedDepartment = findDepartmentOption(
    options as never,
    departmentId,
  );
  const savedLevel =
    (data.profile.enrollment as { yearLevel?: string } | null)?.yearLevel ??
    null;
  const savedDepartmentId =
    (data.profile.enrollment as { departmentId?: string } | null)
      ?.departmentId ?? null;
  const isStaleUnchanged = Boolean(
    savedLevel &&
    savedDepartmentId === departmentId &&
    savedLevel === yearLevel &&
    !isLevelOffered(selectedDepartment, savedLevel as never),
  );
  const levelValid =
    (YEAR_LEVELS as unknown as string[]).includes(yearLevel) &&
    (isLevelOffered(selectedDepartment, yearLevel as never) ||
      isStaleUnchanged);
  const staleLevelNote = (() => {
    if (mode !== "edit" || !savedLevel || !selectedDepartment) return null;
    if (isLevelOffered(selectedDepartment, savedLevel as never)) return null;
    return `${YEAR_LEVEL_LABELS[savedLevel as keyof typeof YEAR_LEVEL_LABELS]} isn't currently offered by ${departmentOptionLabel(selectedDepartment)}. You can still save it unchanged.`;
  })();
  const numberFilled = !showNumberField || studentNumber.trim().length >= 1;
  const allValid =
    numberValid &&
    numberFilled &&
    ayValid &&
    courseValid &&
    levelValid &&
    hasActiveYear &&
    !noYearConfigured;
  const numberError =
    (touched.studentNumber || submitAttempted) &&
    showNumberField &&
    !studentNumber.trim()
      ? "Enter your student number"
      : (touched.studentNumber || submitAttempted) &&
          showNumberField &&
          !numberValid
        ? "Only numbers are allowed."
        : null;
  const ayError =
    (touched.academicYearId || submitAttempted) && !ayValid
      ? "Choose an academic year"
      : null;
  const courseError =
    (touched.departmentId || submitAttempted) && !courseValid
      ? "Choose your course"
      : null;
  const levelError =
    (touched.yearLevel || submitAttempted) && !levelValid
      ? "Choose your year level"
      : null;
  const saveMutation = useMutation(
    api.student.saveEnrollment.mutationOptions(),
  );
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitAttempted(true);
    setTouched({
      studentNumber: true,
      academicYearId: true,
      departmentId: true,
      yearLevel: true,
    });
    if (!allValid) return;
    setServerError(null);
    try {
      await saveMutation.mutateAsync({
        academicYearId,
        departmentId,
        yearLevel: yearLevel as never,
        ...(showNumberField ? { studentNumber: studentNumber.trim() } : {}),
      });
      await queryClient.invalidateQueries({ queryKey: ["student"] });
      notify(
        mode === "edit"
          ? "Enrollment record updated"
          : "Enrollment details saved",
      );
      onclose?.();
    } catch (err) {
      setServerError(
        (err as { message?: string }).message ?? "Could not save — try again.",
      );
    }
  }
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const firstInputRef = useRef<HTMLInputElement | null>(null);
  function handleKeydown(e: React.KeyboardEvent) {
    if (!hardGate && e.key === "Escape") {
      e.preventDefault();
      onclose?.();
      return;
    }
    if (e.key !== "Tab" || !dialogRef.current) return;
    const focusables = dialogRef.current.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    if (focusables.length === 0) return;
    const first = focusables[0]!;
    const last = focusables[focusables.length - 1]!;
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }
  useEffect(() => {
    if (!initialized.current || optionsLoading) return;
    const t = requestAnimationFrame(() => {
      if (firstInputRef.current) firstInputRef.current.focus();
      else dialogRef.current?.focus();
    });
    return () => cancelAnimationFrame(t);
  }, [optionsLoading]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);
  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-4"
      role="presentation"
    >
      <div
        className="absolute inset-0 bg-ink/40 backdrop-blur-[2px]"
        aria-hidden="true"
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="onboarding-title"
        aria-describedby="onboarding-desc"
        tabIndex={-1}
        onKeyDown={handleKeydown}
        className="relative flex max-h-[90dvh] w-full max-w-[480px] flex-col overflow-hidden rounded-[20px] border border-white/20 bg-white/95 shadow-[0_16px_48px_rgba(16,24,40,0.18),0_4px_12px_rgba(16,24,40,0.12)] backdrop-blur-[20px] backdrop-saturate-[180%]"
      >
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-white/60" />
        <div className="overflow-y-auto overscroll-contain px-6 pb-6 pt-7 sm:px-7 sm:pt-8">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2
                id="onboarding-title"
                className="text-[20px] font-semibold tracking-[-0.02em] text-ink"
              >
                Complete your student profile
              </h2>
              <p
                id="onboarding-desc"
                className="mt-1.5 text-[14px] leading-5 text-muted"
              >
                We need these to show your records to your instructor.
              </p>
            </div>
            {!hardGate ? (
              <button
                type="button"
                onClick={() => onclose?.()}
                aria-label="Close"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ink/5 text-muted transition-colors hover:bg-ink/10 hover:text-ink"
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M18 6 6 18" />
                  <path d="m6 6 12 12" />
                </svg>
              </button>
            ) : null}
          </div>
          {!hasActiveYear && !optionsLoading ? (
            <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 px-3 py-3">
              <p className="text-sm text-amber-900">
                {NO_ACADEMIC_YEAR_MESSAGE}
              </p>
              <p className="mt-1 text-xs text-amber-700">
                Choose from the available years below — or contact the SBO
                office.
              </p>
            </div>
          ) : null}
          {noYearConfigured ? (
            <p
              className="mt-5 rounded-xl border border-error/20 bg-error/5 px-3 py-3 text-sm text-error"
              role="alert"
            >
              Enrollment is not open yet — try again later.
            </p>
          ) : null}
          <form className="mt-5 space-y-4" onSubmit={handleSubmit} noValidate>
            {showNumberField ? (
              <div className="space-y-1.5">
                <label
                  htmlFor="onboarding-studentNumber"
                  className="text-sm font-medium text-ink"
                >
                  Student number
                </label>
                <input
                  ref={firstInputRef}
                  id="onboarding-studentNumber"
                  type="text"
                  inputMode="numeric"
                  maxLength={64}
                  autoComplete="off"
                  placeholder="e.g. 2401117979"
                  value={studentNumber}
                  onChange={(e) => {
                    setStudentNumber(e.target.value);
                    if (serverError) setServerError(null);
                  }}
                  aria-invalid={Boolean(numberError)}
                  aria-describedby={numberError ? "onb-num-err" : undefined}
                  onBlur={() =>
                    setTouched((t) => ({ ...t, studentNumber: true }))
                  }
                  className={`h-11 w-full rounded-xl border bg-surface px-3 text-[15px] tabular-nums text-ink outline-none placeholder:text-muted/60 focus:border-primary focus:ring-2 focus:ring-primary/25 ${numberError ? "border-error" : "border-border"}`}
                />
                {numberError ? (
                  <p
                    id="onb-num-err"
                    className="text-xs text-error"
                    aria-live="polite"
                  >
                    {numberError}
                  </p>
                ) : null}
              </div>
            ) : derivedNumber ? (
              <div className="space-y-1.5">
                <span className="text-sm font-medium text-ink">
                  Student number
                </span>
                <p
                  className="flex h-11 items-center justify-between rounded-xl border border-border bg-surface-2 px-3 text-[15px] tabular-nums text-ink"
                  data-testid="derived-student-number"
                >
                  <span>{derivedNumber}</span>
                  <span className="text-xs font-normal text-muted">
                    from your email address
                  </span>
                </p>
              </div>
            ) : null}
            <div className="space-y-1.5">
              <label
                htmlFor="onboarding-ay"
                className="text-sm font-medium text-ink"
              >
                Academic year
              </label>
              <AcademicYearSelect
                id="onboarding-ay"
                variant="onboarding"
                value={academicYearId}
                options={(options?.academicYears ?? []) as never}
                loading={optionsLoading}
                disabled={optionsLoading || noYearConfigured}
                invalid={Boolean(ayError)}
                describedBy={ayError ? "onb-ay-err" : undefined}
                placeholder="Select academic year"
                onblur={() =>
                  setTouched((t) => ({ ...t, academicYearId: true }))
                }
                onselect={(yearId) => {
                  setAcademicYearId(yearId);
                  setTouched((t) => ({ ...t, academicYearId: false }));
                  if (serverError) setServerError(null);
                }}
              />
              {ayError ? (
                <p
                  id="onb-ay-err"
                  className="text-xs text-error"
                  aria-live="polite"
                >
                  {ayError}
                </p>
              ) : null}
            </div>
            <div className="space-y-1.5">
              <span className="text-sm font-medium text-ink">
                Course & year level
              </span>
              <CourseYearPicker
                departmentId={departmentId}
                yearLevel={yearLevel}
                options={options as never}
                loading={optionsLoading}
                error={courseError}
                levelError={levelError}
                staleNote={staleLevelNote}
                onselect={(value) => {
                  setDepartmentId(value.departmentId);
                  setYearLevel(value.yearLevel);
                  setTouched((t) => ({
                    ...t,
                    departmentId: false,
                    yearLevel: false,
                  }));
                  if (serverError) setServerError(null);
                }}
              />
              {courseError ? (
                <p
                  id="onb-course-err"
                  className="text-xs text-error"
                  aria-live="polite"
                >
                  {courseError}
                </p>
              ) : null}
              {levelError ? (
                <p
                  id="onb-level-err"
                  className="text-xs text-error"
                  aria-live="polite"
                >
                  {levelError}
                </p>
              ) : null}
              <p className="text-xs text-muted">
                Choose the program and year level you are enrolled in for this
                academic year.
              </p>
            </div>
            {serverError ? (
              <p
                className="rounded-xl border border-error/20 bg-error/5 px-3 py-2 text-sm text-error"
                role="alert"
                aria-live="assertive"
              >
                {serverError}
              </p>
            ) : null}
            <button
              type="submit"
              disabled={saveMutation.isPending || !allValid}
              className="mt-1 flex h-11 w-full items-center justify-center rounded-xl bg-primary px-4 text-[15px] font-semibold text-white shadow-[0_1px_2px_rgba(16,24,40,0.08)] transition-[transform,opacity] duration-100 ease-out active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100"
            >
              {saveMutation.isPending ? "Saving…" : "Save and continue"}
            </button>
            {hardGate ? (
              <p className="text-center text-xs text-muted">
                This step is required before you can use the app.
              </p>
            ) : null}
          </form>
        </div>
      </div>
    </div>
  );
}
