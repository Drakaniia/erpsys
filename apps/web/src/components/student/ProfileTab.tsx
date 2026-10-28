import { useEffect, useState } from "react";
import EmptyState from "../ui/EmptyState";
import OnboardingModal from "./OnboardingModal";
import ReportReviewModal from "../report/ReportReviewModal";
import {
  releaseReview,
  saveReview,
  type PreparedReview,
} from "$lib/report/review";
import {
  NOT_READY_MESSAGE,
  REPORT_FAILED_MESSAGE,
  createEnrollmentReport,
} from "$lib/student/enrollment-report";
import {
  isEditableEnrollment,
  profileEnrollmentCourse,
  profileEnrollmentLevel,
  profileEnrollmentYear,
} from "$lib/student/profile";
import type { MyStepsData } from "$lib/student/types";

export default function ProfileTab({
  data,
  studentName,
  email,
}: {
  data: MyStepsData;
  studentName: string;
  email: string;
}) {
  const [editOpen, setEditOpen] = useState(false);
  // ponytail: factory holds plain fields — bump a counter to re-read them;
  // add a subscription only if two surfaces ever share one instance.
  const [report] = useState(() => createEnrollmentReport());
  const [review, setReview] = useState<PreparedReview | null>(null);
  const [, bump] = useState(0);

  useEffect(() => {
    if (!review) return;
    return () => releaseReview(review);
  }, [review]);

  function openReview() {
    void report
      .prepare()
      .then((prepared) => {
        if (prepared) setReview(prepared);
      })
      .finally(() => bump((n) => n + 1));
  }

  const records = data.profile.enrollments as {
    academicYearId: string;
    academicYearLabel: string;
    semesterLabel: string;
    departmentName: string;
    departmentCode: string;
    yearLevel: never;
  }[];
  const activeYearId = data.academicYearId as string | null;

  const canDownloadReport = (
    data.steps as { code: string; status: string }[]
  ).some((step) => step.code === "ENROLLMENT" && step.status === "VERIFIED");

  return (
    <>
      <div
        id="student-tabpanel-profile"
        role="tabpanel"
        aria-labelledby="student-tab-profile"
        tabIndex={-1}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-28 pt-3 outline-none lg:overflow-hidden lg:px-6 lg:pb-6 lg:pt-4"
      >
        <div className="mx-auto max-w-[560px] space-y-4 lg:max-w-[720px]">
          <section className="rounded-2xl border border-border bg-surface-raised p-4">
            <h2 className="text-sm font-semibold tracking-[-0.01em] text-ink">
              Your details
            </h2>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex items-baseline justify-between gap-4">
                <dt className="text-muted">Name</dt>
                <dd className="min-w-0 truncate text-right font-medium text-ink">
                  {studentName || "—"}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-4">
                <dt className="text-muted">Email</dt>
                <dd className="min-w-0 truncate text-right text-ink">
                  {email || "—"}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-4">
                <dt className="text-muted">Student number</dt>
                <dd className="text-right tabular-nums text-ink">
                  {data.profile.studentNumber ?? "—"}
                </dd>
              </div>
            </dl>
            {data.profile.isOutsideOrg ? (
              <p className="mt-3 text-xs text-muted">
                You signed in from outside the university domain — your number
                is how the office finds you.
              </p>
            ) : null}
          </section>

          <section aria-labelledby="profile-enrollments-title">
            <div className="flex items-center justify-between gap-3">
              <h2
                id="profile-enrollments-title"
                className="text-sm font-semibold tracking-[-0.01em] text-ink"
              >
                Enrollment records
              </h2>
              {records.length > 0 ? (
                <button
                  type="button"
                  onClick={() => setEditOpen(true)}
                  className="press rounded-lg px-2 py-1 text-xs font-medium text-primary transition-colors duration-100 ease-out hover:bg-primary/10"
                >
                  Update
                </button>
              ) : null}
            </div>

            {records.length === 0 ? (
              <div className="mt-2 rounded-2xl border border-border bg-surface-raised">
                <EmptyState
                  title="No enrollment record yet"
                  hint="Add your course and year level so your instructor can find you."
                  icon="form"
                  fade={false}
                />
                <div className="flex justify-center pb-5">
                  <button
                    type="button"
                    onClick={() => setEditOpen(true)}
                    className="press rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white shadow-[0_1px_2px_rgba(16,24,40,0.08)] transition-[transform,background-color] duration-100 ease-out"
                  >
                    Add course & year level
                  </button>
                </div>
              </div>
            ) : (
              <ul className="mt-2 space-y-2">
                {records.map((record) => {
                  const editable = isEditableEnrollment(record, activeYearId);
                  const current = record.academicYearId === activeYearId;
                  return (
                    <li
                      key={record.academicYearId}
                      className="record-card rounded-2xl border border-border bg-surface-raised p-4"
                      data-editable={editable ? "true" : "false"}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="flex items-center gap-2 text-[15px] font-semibold text-ink">
                            <span className="truncate">
                              {profileEnrollmentYear(record)}
                            </span>
                            {current ? (
                              <span className="shrink-0 rounded-full border border-primary/25 bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                                Current
                              </span>
                            ) : null}
                          </p>
                          <p className="mt-1 truncate text-sm text-ink/80">
                            {profileEnrollmentCourse(record)}
                          </p>
                          <p className="mt-0.5 text-sm text-muted">
                            {profileEnrollmentLevel(record)}
                          </p>
                        </div>

                        {editable ? (
                          <button
                            type="button"
                            onClick={() => setEditOpen(true)}
                            aria-label={`Edit ${profileEnrollmentYear(record)}`}
                            className="press shrink-0 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-ink transition-[transform,background-color,border-color] duration-100 ease-out hover:bg-ink/[0.03]"
                          >
                            Edit
                          </button>
                        ) : null}
                      </div>

                      {!editable ? (
                        <p className="mt-2 text-xs text-muted">
                          Past record — kept for history.
                        </p>
                      ) : null}

                      {current && canDownloadReport ? (
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            aria-busy={report.isPending}
                            disabled={report.isPending}
                            onClick={openReview}
                            className="press rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-primary transition-[transform,background-color,border-color] duration-100 ease-out hover:border-primary/40 hover:bg-primary/10 disabled:opacity-60"
                          >
                            Review enrollment report
                          </button>
                          {report.state === "notReady" ||
                          report.state === "failed" ? (
                            <p className="text-xs text-muted">
                              {report.state === "notReady"
                                ? NOT_READY_MESSAGE
                                : REPORT_FAILED_MESSAGE}
                              <button
                                type="button"
                                onClick={openReview}
                                className="ml-1 font-medium text-primary underline-offset-2 hover:underline"
                              >
                                Try again
                              </button>
                            </p>
                          ) : null}
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      </div>

      {editOpen ? (
        <OnboardingModal
          data={data}
          mode="edit"
          onclose={() => setEditOpen(false)}
        />
      ) : null}

      {review ? (
        <ReportReviewModal
          review={review}
          onclose={() => setReview(null)}
          onconfirm={() => {
            saveReview(review);
            setReview(null);
          }}
        />
      ) : null}
    </>
  );
}
