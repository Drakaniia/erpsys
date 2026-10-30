import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { skipToken, useQuery } from "@tanstack/react-query";
import { truncationNotice } from "$lib/domain/report";
import DitherLoader from "../ui/DitherLoader";
import PageLoader from "../ui/PageLoader";
import EmptyState from "../ui/EmptyState";
import ReportFilterBar from "./ReportFilterBar";
import { reportFilterEcho } from "$lib/report/filter-echo";
import StudentPicker, { type PickerStudent } from "./StudentPicker";
import { readStudentFilters } from "$lib/instructor/students";
import {
  readReportKind,
  readReportScope,
  reportKindUpdate,
  rosterReportInput,
} from "$lib/instructor/reports";
import { notify } from "$lib/notifications";
import { api } from "$lib/api";
import { formatCount } from "$lib/report/format";
import {
  prepareReview,
  releaseReview,
  saveReview,
  type PreparedReview,
} from "$lib/report/review";
import {
  defaultFilterValueFor,
  type ReportDepartment,
  type ReportFilterValue,
} from "$lib/report/filter-config";
import {
  readReportFilterValue,
  reportFilterFieldFor,
  reportFilterUpdates,
  splitSort,
} from "$lib/report/filter-params";
import {
  reportsForRole,
  type ReportFilterKey,
  type ReportKind,
  type ReportRole,
} from "$lib/report/types";

/**
 * The table headings shown above the count line, so a zero-match result reads
 * as "this report has no rows for these filters" rather than as a broken
 * panel (spec 5.17). The strings match the builder's own column headings; a
 * report kind with no rowset -- the two summaries and the record sheet --
 * declares an empty list and renders no table at all.
 */
import { REPORT_PREVIEW_COLUMNS } from "./report-preview-columns";
import ReportReviewModal from "./ReportReviewModal";
export { REPORT_PREVIEW_COLUMNS } from "./report-preview-columns";

/**
 * The filter a report cannot run without. The officer step register takes a
 * required `step` with no server-side default, so the panel holds Generate
 * until one is chosen rather than letting the call fail (spec 9.4). Declared
 * by report kind rather than by role, so adding a required filter to a
 * catalogue entry needs no change here.
 */
const REQUIRED_FILTER_BY_KIND: Partial<Record<ReportKind, ReportFilterKey>> = {
  "step-register": "step",
};

const FORBIDDEN_FALLBACK = "This student belongs to another department.";
const GENERATE_FALLBACK = "The PDF could not be generated.";

export default function ReportsPanel({
  role,
  hasActiveYear,
  yearLabel,
  semester,
  userName,
}: {
  role: ReportRole;
  hasActiveYear: boolean;
  yearLabel: string;
  semester: string;
  userName: string;
}) {
  const [params] = useSearchParams();
  const navigate = useNavigate();

  const catalog = reportsForRole(role);

  const selectedKind =
    readReportKind(params, catalog) ??
    (catalog[0] as { kind: ReportKind }).kind;
  const def =
    catalog.find((entry) => entry.kind === selectedKind) ?? catalog[0];

  const scope = readReportScope(params);
  const filterValue = readReportFilterValue(params, role, scope);

  // The student selection is deliberately NOT in the URL: a batch of record
  // sheets is a handful of ids, and `?picked=` would outgrow any shareable link
  // while adding nothing a reload could not rebuild.
  const [picked, setPicked] = useState<PickerStudent[]>([]);
  const [pending, setPending] = useState(false);
  const [forbidden, setForbidden] = useState<string | null>(null);
  // The rendered document waiting for the user's confirmation. Nothing is
  // written to disk until the modal's own Download button is pressed.
  const [review, setReview] = useState<PreparedReview | null>(null);

  useEffect(() => {
    if (!review) return;
    return () => releaseReview(review);
  }, [review]);

  function updateUrl(updates: Record<string, string | null>) {
    const next = new URLSearchParams(params);
    for (const [key, entry] of Object.entries(updates)) {
      if (entry === null) next.delete(key);
      else next.set(key, entry);
    }
    // React Router has no `keepFocus`; `preventScrollReset` is the closest
    // equivalent and keeps the panel from jumping to the top.
    navigate(`?${next.toString()}`, {
      replace: true,
      preventScrollReset: true,
    });
  }

  /**
   * `?ay=` belongs to the Students tab and is not a report filter -- reports are
   * about the ACTIVE year (spec 5.10), so the param is carried through untouched
   * rather than deleted. Switching back to Students should not lose the year
   * someone chose there.
   */
  function withPreservedYear(updates: Record<string, string | null>) {
    if (role !== "instructor" || updates.ay !== null) return updates;
    const current = params.get("ay");
    if (!current) return updates;
    return { ...updates, ay: current };
  }

  function selectReport(kind: ReportKind) {
    if (kind === def.kind) return;
    // Filters the incoming report does not declare are dropped here rather than
    // left to fire against a query that never reads them.
    const next: ReportFilterValue = {
      ...defaultFilterValueFor(role),
      scope: filterValue.scope,
      sort: filterValue.sort,
    };
    updateUrl({
      ...withPreservedYear(reportFilterUpdates(next, role)),
      ...reportKindUpdate(kind),
    });
  }

  function onFilterChange(patch: Partial<ReportFilterValue>) {
    updateUrl(
      withPreservedYear(
        reportFilterUpdates({ ...filterValue, ...patch }, role),
      ),
    );
  }

  /**
   * Two queries rather than one branching query: the instructor and admin
   * `listDepartments` procedures return different item shapes, and a single
   * query would have to accept a union of two incompatible option objects.
   * Both are skipped for the officer, whose reports expose no course filter.
   */
  const instructorDepartmentsQuery = useQuery(
    role === "instructor"
      ? api.instructor.listDepartments.queryOptions({ staleTime: 300_000 })
      : api.instructor.listDepartments.queryOptions({ input: skipToken }),
  );

  const adminDepartmentsQuery = useQuery(
    role === "admin"
      ? api.admin.listDepartments.queryOptions({ staleTime: 300_000 })
      : api.admin.listDepartments.queryOptions({ input: skipToken }),
  );

  const departments = (
    role === "instructor"
      ? (instructorDepartmentsQuery.data?.data ?? [])
      : role === "admin"
        ? (adminDepartmentsQuery.data?.data ?? [])
        : []
  ) as ReportDepartment[];

  const requiredKey = REQUIRED_FILTER_BY_KIND[def.kind] ?? null;
  const requiredUnset =
    requiredKey !== null &&
    def.filters.includes(requiredKey) &&
    !String(filterValue[reportFilterFieldFor(requiredKey)] ?? "");

  const officerInput = (() => {
    const { sort, dir } = splitSort(filterValue.sort);
    return {
      step: filterValue.step,
      sort,
      dir,
      q: filterValue.q,
      status: filterValue.status,
      evidence: filterValue.evidence,
      range: filterValue.range,
    };
  })();

  const rosterInput =
    role === "instructor"
      ? rosterReportInput(readStudentFilters(params), scope)
      : null;

  const directoryInput = (() => {
    const { sort, dir } = splitSort(filterValue.sort);
    // The admin's year-level control is SINGLE-select (`REPORT_FILTER_CONFIG`),
    // so the first entry is the whole filter -- there is no second one for the
    // query to silently drop while the echo names it.
    const level = filterValue.yearLevels[0];
    return {
      q: filterValue.q,
      role: filterValue.role,
      outside: filterValue.org,
      departmentId: filterValue.course || undefined,
      yearLevel: level,
      sort,
      dir,
    };
  })();

  const stepQuery = useQuery(
    api.officer.getStepRegisterReport.queryOptions({
      input:
        !hasActiveYear || def.kind !== "step-register" || requiredUnset
          ? skipToken
          : officerInput,
    }),
  );

  const rosterQuery = useQuery(
    api.instructor.getRosterReport.queryOptions({
      input:
        !hasActiveYear || def.kind !== "roster" || !rosterInput
          ? skipToken
          : rosterInput,
    }),
  );

  const directoryQuery = useQuery(
    api.admin.getUserDirectoryReport.queryOptions({
      input:
        !hasActiveYear || def.kind !== "user-directory"
          ? skipToken
          : directoryInput,
    }),
  );

  /**
   * R2 and R5 subscribe to the console's OWN `getOverview` entry. TanStack keys
   * on the procedure, so this is the same cache row the Overview tab is already
   * polling -- a second observer, not a second request (spec 9.4 step 3).
   *
   * Each one is skipped for every role but its own, on the same `skipToken`
   * pattern the department queries above use. Left unguarded, opening the
   * INSTRUCTOR Reports tab fired `officer.getOverview` AND `admin.getOverview`,
   * and both 403 -- two guaranteed-failing requests on every visit.
   */
  const officerOverviewQuery = useQuery(
    role === "officer"
      ? api.officer.getOverview.queryOptions()
      : api.officer.getOverview.queryOptions({ input: skipToken }),
  );
  const adminOverviewQuery = useQuery(
    role === "admin"
      ? api.admin.getOverview.queryOptions()
      : api.admin.getOverview.queryOptions({ input: skipToken }),
  );

  type Preview = { returned: number; matched: number; truncated: boolean };

  const reportData =
    def.kind === "step-register"
      ? (stepQuery.data as never)
      : def.kind === "roster"
        ? (rosterQuery.data as never)
        : def.kind === "user-directory"
          ? (directoryQuery.data as never)
          : null;

  const preview: Preview | null = reportData
    ? {
        returned: (reportData as any).rows.length,
        matched: (reportData as any).matchedCount,
        truncated: (reportData as any).truncated,
      }
    : null;

  // `isLoading`, not `isPending`: a query skipped by `skipToken` is permanently
  // "pending" in TanStack, so `isPending` would leave the loader up forever
  // whenever a required filter is unset.
  const previewLoading =
    def.kind === "step-register"
      ? stepQuery.isLoading
      : def.kind === "roster"
        ? rosterQuery.isLoading
        : def.kind === "user-directory"
          ? directoryQuery.isLoading
          : false;

  const previewColumns = REPORT_PREVIEW_COLUMNS[def.kind];

  // The cap sentence is the server's copy, verbatim: the panel and the PDF
  // footer must not be able to say different things (spec 5.12 / 9.4).
  const capNotice = preview?.truncated
    ? truncationNotice(preview.returned, preview.matched)
    : "";

  const noMatches = preview !== null && preview.matched === 0;
  const needsStudents = def.needsStudentPicker;

  const canGenerate =
    hasActiveYear &&
    !pending &&
    !requiredUnset &&
    !noMatches &&
    (!needsStudents || picked.length > 0);

  const disabledReason = (() => {
    if (!hasActiveYear) return "There is no active academic year.";
    if (requiredUnset) return "Choose a step to continue.";
    if (noMatches) return "No records match the selected filters.";
    if (needsStudents && picked.length === 0)
      return "Select at least one student.";
    return null;
  })();

  function isForbidden(error: unknown): boolean {
    return (
      typeof error === "object" &&
      error !== null &&
      (error as { status?: unknown }).status === 403
    );
  }

  /**
   * The one chain BOTH error paths read, so the two cannot drift apart: a
   * thrown `Error`'s own message, then the `data.message` a rejection carries
   * when it is not an `Error`, then `null` for the caller's fallback.
   */
  function thrownMessage(error: unknown): string | null {
    if (error instanceof Error && error.message) return error.message;
    const message = (error as { data?: { message?: unknown } } | null)?.data
      ?.message;
    return typeof message === "string" && message.trim() ? message : null;
  }

  function errorMessage(error: unknown): string {
    return thrownMessage(error) ?? GENERATE_FALLBACK;
  }

  /**
   * The server OWNS this sentence: `scope: "mine"` refusing a foreign student is
   * a server rule, and the guidance that goes with it belongs beside it. The
   * fallback is only for an error that arrives without a message at all.
   */
  function forbiddenMessage(error: unknown): string {
    return thrownMessage(error) ?? FORBIDDEN_FALLBACK;
  }

  async function loadRecordBatch(): Promise<unknown> {
    const records: unknown[] = [];
    for (const student of picked) {
      const input = { studentProfileId: student.studentProfileId };
      if (role === "instructor") {
        records.push(
          await api.instructor.getStudentRecord.call({ ...input, scope }),
        );
      } else if (role === "admin") {
        records.push(await api.admin.getStudentRecord.call(input));
      } else {
        records.push(await api.officer.getStudentRecord.call(input));
      }
    }
    return records;
  }

  function loadForKind(): () => Promise<unknown> {
    switch (def.kind) {
      case "record":
        return loadRecordBatch;
      case "step-summary": {
        const data = officerOverviewQuery.data;
        if (!data) throw new Error("The officer overview is still loading.");
        return async () => data;
      }
      case "enrollment-summary": {
        const data = adminOverviewQuery.data;
        if (!data) throw new Error("The admin overview is still loading.");
        return async () => data;
      }
      case "step-register":
        return async () =>
          stepQuery.data ??
          (await api.officer.getStepRegisterReport.call(officerInput));
      case "roster":
        return async () =>
          rosterQuery.data ??
          (await api.instructor.getRosterReport.call(rosterInput as never));
      case "user-directory":
        return async () =>
          directoryQuery.data ??
          (await api.admin.getUserDirectoryReport.call(
            directoryInput as never,
          ));
    }
  }

  function discriminator(): string | null {
    if (def.kind === "step-register") return filterValue.step || null;
    if (def.kind === "record" && picked.length === 1) return picked[0].name;
    return null;
  }

  /**
   * Prepares the document and opens the review step. The same `load()` and the
   * same builder as before, followed by ONE render that is both previewed and
   * saved -- so Generate never downloads on its own any more.
   */
  async function generate() {
    if (!canGenerate) return;
    setPending(true);
    setForbidden(null);
    try {
      const prepared = await prepareReview({
        role,
        kind: def.kind,
        title: def.label,
        description: def.description,
        generatedBy: userName,
        yearLabel,
        semester,
        filters: reportFilterEcho(filterValue, def, departments, role),
        load: loadForKind(),
        discriminator: discriminator(),
        // A FRESH literal with `counts`' own field names, not `preview` itself.
        // `counts` declares all three as required, so a rename on either side is
        // a compile error rather than the silent mismatch that left the PDF
        // footer printing no cap notice at all (spec 12.6).
        counts: preview
          ? {
              matchedCount: preview.matched,
              returnedCount: preview.returned,
              truncated: preview.truncated,
            }
          : undefined,
      });
      setReview(prepared);
    } catch (error) {
      // A refused student is guidance, not a failure: it is shown beside the
      // selection and the picker stays usable (spec 8.2).
      if (isForbidden(error)) {
        setForbidden(forbiddenMessage(error));
      } else {
        notify(errorMessage(error), "error");
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="space-y-4">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
          Reports
        </h2>
        {hasActiveYear ? (
          <p className="text-sm text-muted tabular-nums">
            AY {yearLabel} &middot; {semester}
          </p>
        ) : null}
      </header>

      <div className="grid gap-4 md:grid-cols-[minmax(200px,260px)_1fr]">
        {/* The catalogue, as a list of real buttons: reachable by Tab in document
            order, and `aria-current` is what marks the selection for a screen
            reader where a background colour would not be. */}
        <nav aria-label="Reports">
          <ul className="space-y-1">
            {catalog.map((entry) => (
              <li key={entry.kind}>
                <button
                  type="button"
                  aria-current={entry.kind === def.kind ? "true" : undefined}
                  onClick={() => selectReport(entry.kind)}
                  className={`press w-full rounded-xl border px-3 py-2.5 text-left transition-colors ${
                    entry.kind === def.kind
                      ? "border-primary/40 bg-primary/[0.06]"
                      : "border-border bg-surface-raised hover:bg-surface"
                  }`}
                >
                  <span
                    className={`block text-sm font-medium ${
                      entry.kind === def.kind ? "text-primary" : "text-ink"
                    }`}
                  >
                    {entry.label}
                  </span>
                  <span className="mt-0.5 block text-xs leading-4 text-muted">
                    {entry.description}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-2 px-1 text-[11px] text-muted/80">
            {catalog.length} available
          </p>
        </nav>

        <div className="min-w-0 rounded-xl border border-border bg-surface-raised p-4">
          <h3 className="text-base font-semibold tracking-tight text-ink">
            {def.label}
          </h3>
          <p className="mt-0.5 text-sm text-muted">{def.description}</p>

          {!hasActiveYear ? (
            /*
              The no-active-academic-year state (spec 5.17 / 15.1). Reports are
              about the current operating period, so with no year there is nothing
              meaningful to generate -- this renders INSTEAD of the filter area
              and the Generate button. The wording is the console's own, not a
              second phrasing: the same sentence `FirstRunBanner` and
              `StepOverview` already use.
            */
            <div className="mt-4">
              <EmptyState
                variant="card"
                title="No active academic year"
                hint="Ask an admin to activate a year before generating reports."
              />
            </div>
          ) : (
            <div className="mt-4 space-y-4">
              {needsStudents ? (
                <StudentPicker
                  role={role}
                  scope={scope}
                  value={picked}
                  forbidden={forbidden}
                  onchange={(next) => {
                    setPicked(next);
                    setForbidden(null);
                  }}
                />
              ) : def.filters.length > 0 ? (
                <ReportFilterBar
                  def={def}
                  role={role}
                  value={filterValue}
                  departments={departments}
                  onchange={onFilterChange}
                />
              ) : null}

              {previewLoading ? (
                <div className="rounded-xl border border-border py-6">
                  <PageLoader label="Counting the rows this report will contain" />
                </div>
              ) : previewColumns.length > 0 && preview ? (
                <>
                  <div className="overflow-x-auto rounded-xl border border-border">
                    <table className="w-full border-collapse text-left text-xs">
                      <thead>
                        <tr className="border-b border-border bg-surface">
                          {previewColumns.map((column) => (
                            <th
                              key={column}
                              scope="col"
                              className="px-2.5 py-2 font-medium text-muted"
                            >
                              {column}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td
                            colSpan={previewColumns.length}
                            className={`px-2.5 py-3 ${
                              noMatches ? "text-ink" : "text-muted"
                            }`}
                          >
                            {noMatches ? (
                              "No records match the selected filters."
                            ) : (
                              <>
                                The PDF will contain{" "}
                                {formatCount(preview.returned)}{" "}
                                {preview.returned === 1 ? "row" : "rows"}.
                              </>
                            )}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  <p
                    className="text-xs text-muted tabular-nums"
                    aria-live="polite"
                  >
                    {formatCount(preview.returned)} of{" "}
                    {formatCount(preview.matched)} rows
                  </p>
                </>
              ) : null}

              {/* The cap warning, before the user commits to a download. Present
                  only when the cap actually bit (spec 5.12). */}
              {capNotice ? (
                <p
                  className="rounded-lg border border-warning/30 bg-warning/[0.06] px-3 py-2 text-sm text-warning"
                  role="status"
                >
                  {capNotice}
                </p>
              ) : null}

              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => void generate()}
                  disabled={!canGenerate}
                  aria-busy={pending}
                  className="press inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary-soft disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {pending ? (
                    <>
                      <DitherLoader size="sm" />
                      Preparing preview…
                    </>
                  ) : (
                    "Generate PDF"
                  )}
                </button>
                {disabledReason && !pending ? (
                  <p className="text-xs text-muted">{disabledReason}</p>
                ) : null}
              </div>
            </div>
          )}
        </div>
      </div>

      {review ? (
        <ReportReviewModal
          review={review}
          onclose={() => setReview(null)}
          onconfirm={() => {
            saveReview(review);
            notify("PDF downloaded", "success");
            setReview(null);
          }}
        />
      ) : null}
    </section>
  );
}
