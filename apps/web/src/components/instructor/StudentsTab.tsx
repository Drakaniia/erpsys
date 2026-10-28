import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { api, queryClient } from "$lib/api";
import { intervalWhileVisible } from "$lib/polling";
import {
  buildStudentFilterInput,
  buildStudentQuery,
  hasActiveStudentFilters,
  nextSortFor,
  readStudentFilters,
  reminderToast,
  sanitizeStudentFilters,
  studentFilterUpdates,
  type StudentBucket,
  type StudentFilters as StudentFilterState,
  type StudentSort,
  type StudentsScope,
} from "$lib/instructor/students";
import type { RosterRow, RosterStats } from "$lib/instructor/types";
import BulkRemindBar from "./BulkRemindBar";
import StudentDetailDrawer from "./StudentDetailDrawer";
import StudentFilters from "./StudentFilters";
import StudentsTable from "./StudentsTable";
import StudentStatsStrip from "./StudentStatsStrip";

export default function StudentsTab({
  onopenqueue,
  ontoast,
  defaultScope = "mine",
}: {
  onopenqueue: (departmentId: string) => void;
  ontoast: (message: string, kind?: "success" | "error" | "warning") => void;
  defaultScope?: StudentsScope;
}) {
  const [params, setParams] = useSearchParams();
  const filters = readStudentFilters(params);
  const [scope, setScope] = useState<StudentsScope>(defaultScope);

  function updateUrl(updates: Record<string, string | null>) {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(updates)) {
      if (value === null) next.delete(key);
      else next.set(key, value);
    }
    setParams(next, { replace: false, preventScrollReset: true });
  }

  function patchFilters(patch: Partial<StudentFilterState>) {
    updateUrl(studentFilterUpdates({ ...filters, ...patch }));
  }
  function clearFilters() {
    updateUrl(studentFilterUpdates({ sort: filters.sort, dir: filters.dir }));
  }
  function toggleCourse(departmentId: string | null) {
    if (departmentId === null) {
      patchFilters({ unassigned: !filters.unassigned });
      return;
    }
    const next = filters.departmentIds.includes(departmentId)
      ? filters.departmentIds.filter((id) => id !== departmentId)
      : [...filters.departmentIds, departmentId];
    patchFilters({ departmentIds: next });
  }
  function toggleBucket(bucket: StudentBucket) {
    const next = filters.buckets.includes(bucket)
      ? filters.buckets.filter((b) => b !== bucket)
      : [...filters.buckets, bucket];
    patchFilters({ buckets: next });
  }
  function handleSort(column: StudentSort) {
    patchFilters(nextSortFor(column, { sort: filters.sort, dir: filters.dir }));
  }

  const directoryQuery = useQuery(
    api.instructor.listDepartments.queryOptions({ staleTime: 5 * 60_000 }),
  );
  const directory = (directoryQuery.data?.data ?? []) as any[];
  const yearsQuery = useQuery(
    api.options.getSignupOptions.queryOptions({ staleTime: 5 * 60_000 }),
  );
  const years = (yearsQuery.data?.academicYears ?? []) as any[];
  const activeYearId = years.find((year) => year.isActive)?.id ?? null;

  useEffect(() => {
    const fix = sanitizeStudentFilters({
      filters,
      scope,
      departments: directoryQuery.isSuccess ? directory : null,
      years: yearsQuery.isSuccess ? years : null,
    });
    if (fix) {
      const next = new URLSearchParams(params);
      for (const [key, value] of Object.entries(
        studentFilterUpdates({ ...filters, ...fix }),
      )) {
        if (value === null) next.delete(key);
        else next.set(key, value);
      }
      setParams(next, { replace: true, preventScrollReset: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [directoryQuery.isSuccess, yearsQuery.isSuccess]);

  const [cursor, setCursor] = useState<string | null>(null);
  const [rows, setRows] = useState<RosterRow[]>([]);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const filterKey = JSON.stringify(buildStudentFilterInput(filters, scope));
  const lastFilterKey = useRef(filterKey);

  useEffect(() => {
    if (lastFilterKey.current !== filterKey) {
      lastFilterKey.current = filterKey;
      lastAppended.current.clear();
      setCursor(null);
      setRows([]);
      setSelected(new Set());
    }
  }, [filterKey]);

  const boardQuery = useQuery(
    api.instructor.getRosterBoard.queryOptions({
      input: buildStudentQuery(filters, { scope, cursor: cursor ?? undefined }),
      refetchInterval: intervalWhileVisible(20_000),
      refetchOnWindowFocus: true,
    }),
  );
  const rosterPage = boardQuery.data?.roster as
    | {
        data: RosterRow[];
        total?: number;
        nextCursor?: string | null;
      }
    | undefined;
  const statsPayload = boardQuery.data?.stats as
    | { year?: { id?: string } | null; stats?: RosterStats }
    | undefined;

  const resolvedYearId = statsPayload?.year?.id ?? null;
  const lastAppended = useRef(new Set<string>());
  const lastPage = useRef<unknown>(null);

  useEffect(() => {
    const data = rosterPage;
    if (!data || data === lastPage.current) return;
    lastPage.current = data;
    if (cursor === null) {
      setRows(data.data);
      return;
    }
    if (lastAppended.current.has(cursor)) return;
    lastAppended.current.add(cursor);
    setRows((prev) => [...prev, ...data.data]);
  }, [rosterPage, cursor]);

  const total = rosterPage?.total ?? null;
  const hasNextPage = Boolean(rosterPage?.nextCursor);
  const loading = boardQuery.isLoading;
  const [pendingPage, setPendingPage] = useState(false);
  const loadingMore = pendingPage && boardQuery.isFetching;

  useEffect(() => {
    if (!boardQuery.isFetching) setPendingPage(false);
  }, [boardQuery.isFetching]);

  function loadMore() {
    const next = rosterPage?.nextCursor;
    if (!next) return;
    setPendingPage(true);
    setCursor(next);
  }

  function toggleSelect(row: RosterRow) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(row.studentProfileId)) next.delete(row.studentProfileId);
      else next.add(row.studentProfileId);
      return next;
    });
  }
  function toggleSelectAll(checked: boolean) {
    setSelected(
      checked ? new Set(rows.map((r) => r.studentProfileId)) : new Set(),
    );
  }

  const remindMutation = useMutation(
    api.instructor.remindStudents.mutationOptions(),
  );
  const [reminderNotice, setReminderNotice] = useState("");
  const [detailId, setDetailId] = useState<string | null>(null);

  async function sendReminders(studentProfileIds: string[]) {
    if (studentProfileIds.length === 0) return;
    try {
      const result = await remindMutation.mutateAsync({
        studentProfileIds,
        academicYearId: filters.academicYearId ?? resolvedYearId ?? undefined,
      });
      const message = reminderToast(result);
      setReminderNotice(message);
      ontoast(message, result.sent > 0 ? "success" : "warning");
      setSelected(new Set());
      setDetailId(null);
      void queryClient.invalidateQueries({
        queryKey: ["instructor", "getRosterBoard"],
      });
    } catch {
      ontoast("Couldn't send reminders — try again.", "error");
    }
  }

  const detailQuery = useQuery(
    api.instructor.getStudentDetail.queryOptions({
      input: {
        studentProfileId: detailId ?? "",
        academicYearId: filters.academicYearId ?? resolvedYearId ?? undefined,
        scope,
      },
      enabled: detailId !== null,
    }),
  );
  const detailError = detailQuery.isError
    ? ((detailQuery.error as Error | null)?.message ??
      "Couldn't load this student.")
    : null;
  const noMappedDepartments =
    directoryQuery.isSuccess && !directory.some((item) => item.assigned);
  const noDepartmentsState =
    noMappedDepartments && scope === "mine" && !filters.unassigned;
  const noYear =
    boardQuery.isSuccess && statsPayload?.year === null;
  const canRemind =
    statsPayload?.year !== null && boardQuery.isSuccess;

  return (
    <>
      <section className="space-y-4" aria-label="Students">
        <StudentFilters
          filters={filters}
          scope={scope}
          departments={directory}
          years={years}
          activeYearId={activeYearId}
          total={total}
          loading={boardQuery.isFetching}
          onscope={(next) => setScope(next)}
          onpatch={patchFilters}
          onclear={clearFilters}
        />
        {boardQuery.isError ? (
          <div className="rounded-2xl border border-error/25 bg-error/5 px-5 py-6 text-center">
            <p className="text-sm font-medium text-ink">
              Couldn&apos;t load the roster.
            </p>
            <p className="mt-1 text-xs text-muted">
              Check your connection and try again.
            </p>
            <button
              type="button"
              onClick={() => void boardQuery.refetch()}
              className="press mt-3 rounded-xl border border-border bg-surface-raised px-4 py-1.5 text-sm text-muted transition-colors hover:text-ink"
            >
              Retry
            </button>
          </div>
        ) : noYear ? (
          <div className="flex flex-col items-center rounded-2xl border border-border bg-surface-raised px-6 py-14 text-center">
            <p className="text-sm font-medium text-muted">
              No academic year is configured.
            </p>
            <p className="mt-1 text-xs text-muted/60">
              The roster is scoped to an academic year — ask an admin to add one
              first.
            </p>
          </div>
        ) : (
          <>
            <StudentStatsStrip
              stats={statsPayload?.stats ?? null}
              loading={boardQuery.isFetching}
              activeBuckets={filters.buckets}
              activeDepartmentIds={filters.departmentIds}
              unassignedActive={filters.unassigned}
              onbucket={toggleBucket}
              oncourse={toggleCourse}
            />
            {noDepartmentsState ? (
              <div className="flex flex-col items-center rounded-2xl border border-border bg-surface-raised px-6 py-14 text-center">
                <p className="text-sm font-medium text-muted">
                  No departments assigned.
                </p>
                <p className="mt-1 text-xs text-muted/60">
                  Contact your admin, or switch to All departments to browse the
                  college.
                </p>
                <button
                  type="button"
                  onClick={() => setScope("all")}
                  className="press mt-3 rounded-xl bg-primary px-4 py-1.5 text-sm font-medium text-white shadow-sm"
                >
                  Show all departments
                </button>
              </div>
            ) : (
              <StudentsTable
                rows={rows}
                loading={loading}
                loadingMore={loadingMore}
                total={total}
                sort={filters.sort}
                dir={filters.dir}
                selectedIds={selected}
                hasNextPage={hasNextPage}
                hasFilters={hasActiveStudentFilters(filters)}
                onsort={handleSort}
                onopen={(row) => setDetailId(row.studentProfileId)}
                onselect={toggleSelect}
                onselectall={toggleSelectAll}
                onloadmore={loadMore}
                onopenqueue={(departmentId) =>
                  departmentId && onopenqueue(departmentId)
                }
                onclear={clearFilters}
              />
            )}
          </>
        )}
        <p className="sr-only" role="status" aria-live="polite">
          {reminderNotice}
        </p>
      </section>
      {canRemind && (
        <BulkRemindBar
          count={selected.size}
          busy={remindMutation.isPending}
          onclear={() => setSelected(new Set())}
          onremind={() => void sendReminders([...selected])}
        />
      )}
      <StudentDetailDrawer
        open={detailId !== null}
        loading={detailQuery.isFetching}
        detail={(detailQuery.data as never) ?? null}
        error={detailError}
        busy={remindMutation.isPending}
        onclose={() => setDetailId(null)}
        onremind={(studentProfileId) => void sendReminders([studentProfileId])}
      />
    </>
  );
}
