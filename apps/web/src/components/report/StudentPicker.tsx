import { useEffect, useRef, useState } from "react";
import { skipToken, useQuery } from "@tanstack/react-query";
import DitherLoader from "../ui/DitherLoader";
import { api } from "$lib/api";
import type { StudentsScope } from "$lib/instructor/students";
import type { ReportRole } from "$lib/report/types";

/**
 * A picked student. `studentNumber` is nullable because the admin and
 * instructor `searchStudents` procedures type it that way (a profile with no
 * number yet is legal), so the row renders `-` rather than an empty cell.
 */
export type PickerStudent = {
  studentProfileId: string;
  name: string;
  studentNumber: string | null;
};

const NO_NUMBER = "no student number";

export default function StudentPicker({
  role,
  scope = "mine",
  value,
  onchange,
  multiple = true,
  forbidden = null,
}: {
  role: ReportRole;
  scope?: StudentsScope;
  value: PickerStudent[];
  onchange: (next: PickerStudent[]) => void;
  /** Multi-select is what makes a batch of record sheets possible (§6.1). */
  multiple?: boolean;
  /**
   * Set by the panel when `getStudentRecord` refused a picked student. Rendered
   * as a plain inline note, never a toast: an instructor reaching for a
   * student in another department is doing something ordinary, and spec 8.2
   * asks for it to read as guidance rather than as a failure.
   */
  forbidden?: string | null;
}) {
  const [term, setTerm] = useState("");
  // The search term debounced into the query key, so a typed name is one request
  // rather than one per keystroke -- the cadence the live filter bars use.
  const [debouncedTerm, setDebouncedTerm] = useState("");
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const [activeIndex, setActiveIndex] = useState(-1);
  const [open, setOpen] = useState(false);
  const listEl = useRef<HTMLDivElement | null>(null);

  const q = debouncedTerm.trim();

  // Three queries rather than one branching query: the procedures return
  // different item shapes, and a single query would have to accept a union of
  // incompatible option objects. Each is skipped for every role but its own, on
  // the same `skipToken` pattern the reports panel uses.
  const instructorSearchQuery = useQuery(
    api.instructor.searchStudents.queryOptions({
      input: !q || role !== "instructor" ? skipToken : { q, scope },
    }),
  );
  const adminSearchQuery = useQuery(
    api.admin.searchStudents.queryOptions({
      input: !q || role !== "admin" ? skipToken : { q },
    }),
  );
  const officerSearchQuery = useQuery(
    api.officer.searchStudents.queryOptions({
      input: !q || role !== "officer" ? skipToken : { q },
    }),
  );

  const searchQuery =
    role === "instructor"
      ? instructorSearchQuery
      : role === "admin"
        ? adminSearchQuery
        : officerSearchQuery;

  const searching = q.length > 0;
  const isLoading = searchQuery.isFetching;
  const failed = searchQuery.isError;

  // Widened once here rather than at four use sites: the three procedures return
  // the same three fields, differing only in whether the number is nullable.
  const rawResults = (searchQuery.data?.data ?? []) as Array<
    Record<string, unknown>
  >;
  const results: PickerStudent[] = rawResults
    .map((row) => {
      const profileId =
        typeof row.studentProfileId === "string" ? row.studentProfileId : null;
      const name =
        typeof row.name === "string"
          ? row.name
          : typeof row.studentName === "string"
            ? row.studentName
            : "";
      const number =
        typeof row.studentNumber === "string" ? row.studentNumber : null;
      if (!profileId) return null;
      return { studentProfileId: profileId, name, studentNumber: number };
    })
    .filter((row): row is PickerStudent => row !== null);

  const chosen = new Set(value.map((student) => student.studentProfileId));
  const pickable = multiple
    ? results
    : results.filter((item) => !chosen.has(item.studentProfileId));

  useEffect(() => {
    if (term.trim()) setOpen(true);
  }, [term]);

  useEffect(() => {
    if (open) {
      listEl.current
        ?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`)
        ?.focus();
    }
  }, [open, activeIndex]);

  function onTermInput(next: string) {
    setTerm(next);
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => setDebouncedTerm(next), 250);
  }

  function add(student: PickerStudent) {
    // Re-clicking a ticked row is a no-op rather than a duplicate: the
    // checkbox column shows the selection, so it has to be truthful.
    if (chosen.has(student.studentProfileId)) return;
    onchange(multiple ? [...value, student] : [student]);
    setTerm("");
    setDebouncedTerm("");
    setOpen(false);
    setActiveIndex(-1);
  }

  function remove(studentProfileId: string) {
    onchange(
      value.filter((student) => student.studentProfileId !== studentProfileId),
    );
  }

  function moveFocus(delta: number) {
    if (pickable.length === 0) return;
    let next = activeIndex + delta;
    if (next < 0) next = pickable.length - 1;
    if (next >= pickable.length) next = 0;
    setActiveIndex(next);
  }

  function onInputKeydown(event: React.KeyboardEvent) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      moveFocus(event.key === "ArrowDown" ? 1 : -1);
      return;
    }
    if (event.key === "Escape") {
      setOpen(false);
      setActiveIndex(-1);
    }
  }

  function onOptionKeydown(event: React.KeyboardEvent, index: number) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      moveFocus(event.key === "ArrowDown" ? 1 : -1);
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      const student = pickable[index];
      if (student) add(student);
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      setActiveIndex(-1);
    }
  }

  function countLabel(n: number): string {
    return n === 1 ? "1 student selected" : `${n} students selected`;
  }

  return (
    <div className="space-y-2.5">
      <div className="relative">
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          aria-hidden="true"
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
        >
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.3-4.3" />
        </svg>
        <input
          type="search"
          role="combobox"
          aria-expanded={open && pickable.length > 0}
          aria-controls="report-student-results"
          aria-autocomplete="list"
          aria-label="Search students for the record sheet"
          placeholder="Search students…"
          autoComplete="off"
          value={term}
          onChange={(e) => onTermInput(e.target.value)}
          onKeyDown={onInputKeydown}
          onFocus={() => setOpen(term.trim().length > 0)}
          className="w-full rounded-lg border border-border bg-surface-raised py-2 pl-9 pr-3 text-sm text-ink placeholder:text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        />
      </div>

      {open && searching ? (
        <div
          ref={listEl}
          id="report-student-results"
          role="listbox"
          aria-label="Matching students"
          className="max-h-64 overflow-y-auto rounded-lg border border-border bg-surface-raised p-1"
        >
          {isLoading ? (
            <p
              className="flex items-center gap-2 px-2.5 py-2 text-sm text-muted"
              role="status"
            >
              <DitherLoader size="sm" />
              Searching…
            </p>
          ) : failed ? (
            <p className="px-2.5 py-2 text-sm text-error" role="status">
              The student search failed. Try again in a moment.
            </p>
          ) : pickable.length === 0 ? (
            <p className="px-2.5 py-2 text-sm text-muted" role="status">
              No students match “{debouncedTerm.trim()}”.
            </p>
          ) : (
            pickable.map((student, index) => {
              const isChosen = chosen.has(student.studentProfileId);
              return (
                <button
                  key={student.studentProfileId}
                  type="button"
                  role="option"
                  aria-selected={isChosen}
                  aria-label={`${student.name}, ${student.studentNumber ?? NO_NUMBER}`}
                  data-index={index}
                  tabIndex={index === activeIndex ? 0 : -1}
                  onClick={() => add(student)}
                  onKeyDown={(e) => onOptionKeydown(e, index)}
                  onPointerDown={(e) => e.preventDefault()}
                  className={`flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-sm leading-5 transition-colors duration-100 ease-out ${
                    index === activeIndex
                      ? "bg-surface text-ink"
                      : "text-ink hover:bg-surface"
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-[5px] border-[1.5px] ${
                      isChosen
                        ? "border-primary bg-primary text-white"
                        : "border-border bg-surface-raised"
                    }`}
                  >
                    {isChosen ? (
                      <svg
                        width="10"
                        height="10"
                        viewBox="0 0 12 12"
                        fill="none"
                      >
                        <path
                          d="M2.5 6.2L4.8 8.5L9.5 3.2"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    ) : null}
                  </span>
                  <span className="min-w-0 flex-1 truncate">
                    {student.name}
                  </span>
                  <span className="shrink-0 text-[11px] tabular-nums text-muted/80">
                    {student.studentNumber ?? "-"}
                  </span>
                </button>
              );
            })
          )}
        </div>
      ) : null}

      {/*
        The FORBIDDEN note sits with the selection rather than over it: the picks
        are still valid, one of them just cannot be exported at the current
        scope, and the fix -- widen the scope, or drop that student -- is a
        decision the user makes here rather than from a toast they have already
        dismissed. Muted, not `text-error`, for the same reason (spec 8.2).
      */}
      {forbidden ? (
        <p
          className="rounded-lg border border-border bg-surface px-2.5 py-2 text-sm text-muted"
          role="status"
        >
          {forbidden}
        </p>
      ) : null}

      {value.length > 0 ? (
        <div className="space-y-1.5">
          <ul className="space-y-1" aria-label="Selected students">
            {value.map((student) => (
              <li
                key={student.studentProfileId}
                className="flex items-center gap-2 rounded-lg border border-border bg-surface-raised px-2.5 py-1.5 text-sm"
              >
                <span className="min-w-0 flex-1 truncate text-ink">
                  {student.name}
                </span>
                <span className="shrink-0 tabular-nums text-muted">
                  {student.studentNumber ?? "-"}
                </span>
                <button
                  type="button"
                  onClick={() => remove(student.studentProfileId)}
                  aria-label={`Remove ${student.name}`}
                  className="press flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-ink/[0.06] hover:text-ink"
                >
                  <svg
                    width="11"
                    height="11"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    aria-hidden="true"
                  >
                    <path d="M6 6l12 12M18 6L6 18" />
                  </svg>
                </button>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted tabular-nums" aria-live="polite">
            {countLabel(value.length)}
          </p>
        </div>
      ) : (
        <p className="text-xs text-muted">
          {multiple
            ? "Search by name or student number. Selecting several exports one sheet per student."
            : "Search by name or student number."}
        </p>
      )}
    </div>
  );
}
