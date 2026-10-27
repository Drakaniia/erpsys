import EmptyState from "../ui/EmptyState";
import SkeletonRows from "./SkeletonRows";
import SubmissionFilters from "./SubmissionFilters";
import Pagination from "../ui/Pagination";
import SubmissionRow from "./SubmissionRow";
import type { ListByStepData, ListItem, StepCode } from "$lib/officer/types";

type Status = "ALL" | "PENDING" | "SUBMITTED" | "VERIFIED" | "RETURNED";
type Evidence = "ALL" | "HAS" | "NONE";
type Range = "ALL" | "today" | "7d" | "30d" | "year";

export default function SubmissionList({
  step,
  data,
  isLoading,
  isError,
  view,
  sort,
  dir,
  page,
  pageSize,
  unreadIds,
  selectedId = null,
  q = "",
  status = "ALL",
  evidence = "ALL",
  range = "ALL",
  unreadOnly = false,
  filterActive = false,
  onqchange,
  onstatuschange,
  onevidencechange,
  onrangechange,
  onunreadtoggle,
  onclearfilters,
  onselect,
  onviewchange,
  onsortchange,
  onpagechange,
  onpagesizechange,
  onrefresh,
  isRefetching,
  newCount = 0,
  onnewseend,
  onopen,
}: {
  step: StepCode;
  data: ListByStepData | undefined;
  isLoading: boolean;
  isError: boolean;
  view: "table" | "cards";
  sort: "submittedAt" | "studentName" | "status";
  dir: "asc" | "desc";
  page: number;
  pageSize: number;
  unreadIds: Set<string>;
  selectedId?: string | null;
  q?: string;
  status?: Status;
  evidence?: Evidence;
  range?: Range;
  unreadOnly?: boolean;
  filterActive?: boolean;
  onqchange: (q: string) => void;
  onstatuschange: (s: Status) => void;
  onevidencechange: (e: Evidence) => void;
  onrangechange: (r: Range) => void;
  onunreadtoggle: () => void;
  onclearfilters: () => void;
  onselect?: (id: string) => void;
  onviewchange: (v: "table" | "cards") => void;
  onsortchange: (
    s: "submittedAt" | "studentName" | "status",
    d: "asc" | "desc",
  ) => void;
  onpagechange: (p: number) => void;
  onpagesizechange: (n: number) => void;
  onrefresh: () => void;
  isRefetching: boolean;
  newCount?: number;
  onnewseend?: () => void;
  onopen: (verificationId: string) => void;
}) {
  const showEvidence = step !== "PROFILING";
  const totalPages = data
    ? Math.max(1, Math.ceil(data.total / data.pageSize))
    : 1;

  function toggleSort(column: "submittedAt" | "studentName" | "status") {
    if (sort === column) onsortchange(column, dir === "asc" ? "desc" : "asc");
    else onsortchange(column, "asc");
  }

  function sortIndicator(column: "submittedAt" | "studentName" | "status") {
    if (sort !== column) return "↕";
    return dir === "asc" ? "↑" : "↓";
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-sm text-muted tabular-nums">
          {data && (
            <>
              {data.unverifiedCount} unverified · {data.verifiedCount} verified
            </>
          )}
          {newCount > 0 && (
            <button
              type="button"
              onClick={onnewseend}
              className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary transition-colors duration-200 ease-out hover:bg-primary/15"
            >
              <span
                aria-hidden="true"
                className="h-1.5 w-1.5 rounded-full bg-primary"
              ></span>
              {newCount} new
            </button>
          )}
        </p>
        <div className="flex items-center gap-2">
          <div
            className="flex rounded-lg border border-border bg-surface p-0.5"
            role="group"
            aria-label="View"
          >
            <button
              onClick={() => onviewchange("table")}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors duration-200 ease-out ${view === "table" ? "bg-primary text-white active:bg-primary-soft" : "text-muted active:bg-ink/5"}`}
              aria-pressed={view === "table"}
            >
              Table
            </button>
            <button
              onClick={() => onviewchange("cards")}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors duration-200 ease-out ${view === "cards" ? "bg-primary text-white active:bg-primary-soft" : "text-muted active:bg-ink/5"}`}
              aria-pressed={view === "cards"}
            >
              Cards
            </button>
          </div>
          <button
            onClick={onrefresh}
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted hover:bg-surface hover:text-ink"
            aria-label={isRefetching ? "Refreshing…" : "Refresh"}
            aria-busy={isRefetching}
          >
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              aria-hidden="true"
              className={isRefetching ? "animate-spin" : ""}
            >
              <path d="M21 12a9 9 0 1 1-2.64-6.36" strokeLinecap="round" />
              <path
                d="M21 3v6h-6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>
      </div>

      <SubmissionFilters
        q={q}
        status={status}
        evidence={evidence}
        range={range}
        unreadOnly={unreadOnly}
        showEvidence={showEvidence}
        onqchange={onqchange}
        onstatuschange={onstatuschange}
        onevidencechange={onevidencechange}
        onrangechange={onrangechange}
        onunreadtoggle={onunreadtoggle}
      />

      {isLoading && !data ? (
        <SkeletonRows view={view} />
      ) : isError && !data ? (
        <div className="flex items-center justify-between rounded-xl border border-border bg-surface-raised px-4 py-3">
          <p className="text-sm text-ink">Could not load this step.</p>
          <button
            onClick={onrefresh}
            className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-white"
          >
            Retry
          </button>
        </div>
      ) : data && data.data.length === 0 ? (
        filterActive ? (
          <EmptyState
            title="No matches"
            hint="No submissions match the current search or filters."
            action={
              <button
                type="button"
                onClick={onclearfilters}
                className="mt-1 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white transition-[transform,background-color] duration-100 ease-out active:scale-[0.97] hover:bg-primary-soft"
              >
                Clear filters
              </button>
            }
          />
        ) : (
          <EmptyState
            title="No submissions yet"
            hint={
              step === "ASSESSMENT"
                ? "Students must tap 'Apply for assessment' first."
                : "Students appear here once they finish this step."
            }
            icon="inbox"
          />
        )
      ) : data ? (
        <>
          {view === "table" ? (
            <div className="overflow-hidden rounded-xl border border-border bg-surface-raised">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-border text-left text-xs font-medium text-muted">
                    <th className="px-4 py-2.5 font-medium">
                      <button
                        onClick={() => toggleSort("studentName")}
                        className="hover:text-ink"
                        aria-label="Sort by student"
                      >
                        Student {sortIndicator("studentName")}
                      </button>
                    </th>
                    <th className="px-4 py-2.5 font-medium">
                      <button
                        onClick={() => toggleSort("submittedAt")}
                        className="hover:text-ink"
                        aria-label="Sort by submitted time"
                      >
                        Submitted {sortIndicator("submittedAt")}
                      </button>
                    </th>
                    {showEvidence && (
                      <th className="px-4 py-2.5 font-medium">Evidence</th>
                    )}
                    <th className="px-4 py-2.5 font-medium">
                      <button
                        onClick={() => toggleSort("status")}
                        className="hover:text-ink"
                        aria-label="Sort by status"
                      >
                        Status {sortIndicator("status")}
                      </button>
                    </th>
                    <th className="px-4 py-2.5 text-right font-medium">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.data.map((item: ListItem) => (
                    <SubmissionRow
                      key={item.verificationId}
                      item={item}
                      view={view}
                      unread={unreadIds.has(item.verificationId)}
                      selected={selectedId === item.verificationId}
                      showEvidence={showEvidence}
                      onselect={onselect}
                      onopen={onopen}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {data.data.map((item: ListItem) => (
                <SubmissionRow
                  key={item.verificationId}
                  item={item}
                  view={view}
                  unread={unreadIds.has(item.verificationId)}
                  selected={selectedId === item.verificationId}
                  showEvidence={showEvidence}
                  onselect={onselect}
                  onopen={onopen}
                />
              ))}
            </div>
          )}
          <Pagination
            page={page}
            pageSize={pageSize}
            total={data.total}
            totalPages={totalPages}
            onpagechange={onpagechange}
            onpagesizechange={onpagesizechange}
            label={(n) => `${n} total`}
            variant="inline"
            hideSizeSelect={data.total <= 25}
            hideNav={totalPages <= 1}
          />
        </>
      ) : null}
    </div>
  );
}
