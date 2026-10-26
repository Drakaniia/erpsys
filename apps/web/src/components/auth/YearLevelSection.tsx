import type { KeyboardEvent } from "react";
import { YEAR_LEVEL_LABELS, type YearLevel } from "$lib/domain/constants";
import {
  departmentOptionLabel,
  type DepartmentOption,
} from "$lib/auth/register-placement";

/** Step 2 of the course/year picker: the offered year levels for the course. */
export default function YearLevelSection({
  displayDepartment,
  stepTwoLevels,
  yearLevel,
  pickedDepartmentId,
  departmentId,
  onChooseLevel,
  onLevelKeyDown,
  onGoBack,
  onListScroll,
  isScrolling,
}: {
  displayDepartment: DepartmentOption | undefined;
  stepTwoLevels: readonly YearLevel[];
  yearLevel: string;
  pickedDepartmentId: string;
  departmentId: string;
  onChooseLevel: (level: YearLevel) => void;
  onLevelKeyDown: (event: KeyboardEvent, index: number) => void;
  onGoBack: () => void;
  onListScroll: () => void;
  isScrolling: boolean;
}) {
  return (
    <section className="w-full shrink-0" aria-label="Year level">
      <div className="flex items-center gap-2 border-b border-border/60 p-2">
        <button
          type="button"
          onClick={onGoBack}
          className="flex h-9 items-center gap-1 rounded-lg px-2 text-sm font-medium text-muted transition-colors duration-100 ease-out hover:bg-ink/[0.04] hover:text-ink"
        >
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
          >
            <path d="m15 18-6-6 6-6" />
          </svg>
          Back
        </button>
        <p className="min-w-0 truncate text-sm font-medium text-ink">
          {displayDepartment ? departmentOptionLabel(displayDepartment) : ""}
        </p>
      </div>
      <ul
        role="listbox"
        aria-label="Year level"
        onScroll={onListScroll}
        className={`apple-scrollbar max-h-[min(248px,44dvh)] overflow-y-auto overscroll-contain p-1 ${isScrolling ? "is-scrolling" : ""}`}
      >
        {stepTwoLevels.map((level, index) => {
          const selected =
            level === yearLevel && pickedDepartmentId === departmentId;
          return (
            <li key={level}>
              <button
                type="button"
                role="option"
                data-level-option
                aria-selected={selected}
                onClick={() => onChooseLevel(level)}
                onKeyDown={(event) => onLevelKeyDown(event, index)}
                className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left text-sm text-ink transition-colors duration-100 ease-out hover:bg-ink/[0.04]"
              >
                <span className="font-medium">{YEAR_LEVEL_LABELS[level]}</span>
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
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
