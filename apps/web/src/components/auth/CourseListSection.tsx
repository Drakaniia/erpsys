import type { KeyboardEvent, RefObject } from "react";
import { departmentLevelRangeLabel } from "$lib/domain/constants";
import {
  departmentOptionLabel,
  type DepartmentOption,
} from "$lib/auth/register-placement";

/** Step 1 of the course/year picker: search + course list. */
export default function CourseListSection({
  searchEl,
  query,
  onQueryChange,
  onSearchKeyDown,
  filtered,
  highlight,
  onHighlightChange,
  departmentId,
  onChooseDepartment,
  onListScroll,
  isScrolling,
}: {
  searchEl: RefObject<HTMLInputElement | null>;
  query: string;
  onQueryChange: (value: string) => void;
  onSearchKeyDown: (event: KeyboardEvent) => void;
  filtered: readonly DepartmentOption[];
  highlight: number;
  onHighlightChange: (index: number) => void;
  departmentId: string;
  onChooseDepartment: (id: string) => void;
  onListScroll: () => void;
  isScrolling: boolean;
}) {
  return (
    <section className="w-full shrink-0" aria-label="Course">
      <div className="border-b border-border/60 p-2">
        <input
          ref={searchEl}
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          type="text"
          placeholder="Search courses…"
          aria-label="Search courses"
          autoComplete="off"
          onKeyDown={onSearchKeyDown}
          className="auth-input h-9 text-sm"
        />
      </div>
      <ul
        role="listbox"
        aria-label="Courses"
        onScroll={onListScroll}
        className={`apple-scrollbar max-h-[min(248px,44dvh)] overflow-y-auto overscroll-contain p-1 ${isScrolling ? "is-scrolling" : ""}`}
      >
        {filtered.length === 0 ? (
          <li className="px-3 py-6 text-center text-sm text-muted">
            No courses match that search.
          </li>
        ) : (
          filtered.map((department, index) => {
            const selected = department.id === departmentId;
            return (
              <li key={department.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onMouseEnter={() => onHighlightChange(index)}
                  onClick={() => onChooseDepartment(department.id)}
                  className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left transition-colors duration-100 ease-out ${
                    index === highlight ? "bg-ink/[0.04]" : ""
                  }`}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-ink">
                      {departmentOptionLabel(department)}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-muted">
                      {departmentLevelRangeLabel(department.yearLevels)}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    {selected ? (
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                        className="text-primary"
                      >
                        <path d="M20 6 9 17l-5-5" />
                      </svg>
                    ) : null}
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                      className="text-muted"
                    >
                      <path d="m9 18 6-6-6-6" />
                    </svg>
                  </span>
                </button>
              </li>
            );
          })
        )}
      </ul>
    </section>
  );
}
