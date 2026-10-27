import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { YEAR_LEVEL_LABELS, type YearLevel } from "$lib/domain/constants";
import {
  findDepartmentOption,
  offeredYearLevels,
} from "$lib/auth/register-placement";
import { notify } from "$lib/notifications";
import { api, queryClient } from "$lib/api";
import type { MyStepsData } from "$lib/student/types";
import YearLevelModal from "./YearLevelModal";

/** The course & year-level row above the checklist, plus its edit dialog. */
export default function StudentYearLevel({ data }: { data: MyStepsData }) {
  const signupOptionsQuery = useQuery(
    api.options.getSignupOptions.queryOptions({
      staleTime: 5 * 60 * 1000,
      refetchOnWindowFocus: false,
    }),
  );
  const enrollment = data.profile.enrollment as {
    departmentId: string;
    departmentName?: string;
    yearLevel: YearLevel;
  } | null;
  const courseOption = findDepartmentOption(
    signupOptionsQuery.data as never,
    enrollment?.departmentId ?? "",
  );
  const courseName =
    enrollment?.departmentName ||
    (courseOption as { name?: string } | null)?.name ||
    "Your course";
  const offeredLevels = offeredYearLevels(courseOption);

  const [levelModalOpen, setLevelModalOpen] = useState(false);
  const [levelError, setLevelError] = useState<string | null>(null);
  const saveLevelMutation = useMutation(
    api.student.saveEnrollment.mutationOptions(),
  );

  async function saveYearLevel(yearLevel: YearLevel) {
    const record = data.profile.enrollment as { departmentId: string } | null;
    const academicYearId = data.academicYearId as string | undefined;
    // Both are required by the mutation. Without them there is nothing to
    // update, and `StudentGate` is already on screen asking for a record.
    if (!record || !academicYearId) {
      notify.error("Save your course and student number first.");
      return;
    }
    setLevelError(null);
    try {
      await saveLevelMutation.mutateAsync({
        academicYearId,
        // The course is not editable here — the Profile tab owns that. Sending
        // the existing one keeps this a single-field edit rather than a second
        // place where a course can be changed.
        departmentId: record.departmentId,
        yearLevel,
      });
      await queryClient.invalidateQueries({ queryKey: ["student"] });
      setLevelModalOpen(false);
      notify("Year level updated");
    } catch (e) {
      const message =
        (e as { message?: string }).message ?? "Could not save — try again.";
      setLevelError(message);
      notify.error(message);
    }
  }

  if (!enrollment) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setLevelModalOpen(true)}
        className="mb-3 flex w-full items-center gap-3 rounded-2xl border border-border bg-surface-raised px-4 py-3 text-left transition-[transform,background-color,border-color] duration-100 ease-out hover:border-primary/30 active:scale-[0.99]"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-xs font-medium uppercase tracking-[0.08em] text-muted">
            Course & year level
          </span>
          <span className="mt-0.5 block truncate text-[15px] font-semibold text-ink">
            {courseName} ·{" "}
            {enrollment.yearLevel
              ? YEAR_LEVEL_LABELS[
                  enrollment.yearLevel as keyof typeof YEAR_LEVEL_LABELS
                ]
              : "Not set"}
          </span>
        </span>
        <span className="shrink-0 text-sm font-medium text-primary">
          Change
        </span>
      </button>
      {levelError ? (
        <p
          className="mb-3 rounded-xl border border-error/25 bg-error/5 px-3 py-2.5 text-sm text-error"
          role="alert"
        >
          {levelError}
        </p>
      ) : null}
      <YearLevelModal
        open={levelModalOpen}
        busy={saveLevelMutation.isPending}
        courseName={courseName}
        offeredLevels={offeredLevels as YearLevel[]}
        savedYearLevel={enrollment?.yearLevel ?? null}
        onsaved={saveYearLevel}
        onclose={() => setLevelModalOpen(false)}
      />
    </>
  );
}
