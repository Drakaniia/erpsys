import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { YEAR_LEVEL_LABELS, type YearLevel } from "$lib/domain/constants";
import {
  departmentOptionLabel,
  findDepartmentOption,
  offeredYearLevels,
  type SignupOptions,
} from "$lib/auth/register-placement";
import CourseListSection from "./CourseListSection";
import YearLevelSection from "./YearLevelSection";
import { useDragTrack } from "./use-drag-track";

const PLACEHOLDER = "Select your course and year level";

export default function CourseYearPicker({
  departmentId = "",
  yearLevel = "",
  options,
  loading = false,
  disabled = false,
  error = null,
  levelError = null,
  staleNote = null,
  id,
  label,
  onselect,
}: {
  departmentId?: string;
  yearLevel?: string;
  options?: SignupOptions;
  loading?: boolean;
  disabled?: boolean;
  error?: string | null;
  levelError?: string | null;
  staleNote?: string | null;
  id?: string;
  label?: string;
  onselect: (value: {
    departmentId: string;
    yearLevel: YearLevel | "";
  }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [focused, setFocused] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const [pickedDepartmentId, setPickedDepartmentId] = useState("");

  const panelEl = useRef<HTMLDivElement | null>(null);
  const triggerEl = useRef<HTMLButtonElement | null>(null);
  const searchEl = useRef<HTMLInputElement | null>(null);

  const track = useDragTrack({ open, hasPicked: pickedDepartmentId !== "" });

  const departments = options?.departments ?? [];

  const selectedDepartment = findDepartmentOption(options, departmentId);
  const selectedLevel = yearLevel ? (yearLevel as YearLevel) : null;
  const displayDepartment = findDepartmentOption(options, pickedDepartmentId);

  const triggerLabel =
    selectedDepartment && selectedLevel
      ? `${departmentOptionLabel(selectedDepartment)} · ${YEAR_LEVEL_LABELS[selectedLevel]}`
      : null;

  // Floating mode (label provided): active while focused, open, or holding
  // a selection, so a chosen course keeps the label upper-left on blur.
  const floating = label !== undefined;
  const isActive = focused || open || triggerLabel !== null;
  const hasError = Boolean(error || levelError);
  const displayLabel =
    triggerLabel ?? (isActive ? (loading ? "Loading…" : PLACEHOLDER) : "");

  const filtered = (() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return departments;
    return departments.filter((d) =>
      departmentOptionLabel(d).toLowerCase().includes(needle),
    );
  })();

  const stepTwoLevels = offeredYearLevels(displayDepartment);

  function openPicker() {
    if (disabled || loading) return;
    setOpen(true);
    setQuery("");
    setHighlight(
      Math.max(
        0,
        filtered.findIndex((d) => d.id === departmentId),
      ),
    );
    setPickedDepartmentId(departmentId);
    track.prepareOpen();
  }

  function closePicker() {
    setOpen(false);
    track.stopDrag();
    queueMicrotask(() => triggerEl.current?.focus());
  }

  function chooseDepartment(deptId: string) {
    setPickedDepartmentId(deptId);
    if (deptId !== departmentId)
      onselect({ departmentId: deptId, yearLevel: "" });
    track.goToStep(2);
  }

  function chooseLevel(level: YearLevel) {
    onselect({ departmentId: pickedDepartmentId, yearLevel: level });
    closePicker();
  }

  useEffect(() => {
    if (!open) return;
    // The overlay is a top layer, so the page behind it must not scroll
    // under the pointer. A host that already locks (the onboarding
    // dialog) nests cleanly: each effect restores what it found.
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (!open || !track.focusAfterStep.current) return;
    const target = track.focusAfterStep.current;
    track.focusAfterStep.current = null;
    queueMicrotask(() => {
      if (target === "search") searchEl.current?.focus();
      else
        panelEl.current
          ?.querySelector<HTMLElement>("[data-level-option]")
          ?.focus();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, track.step]);

  function handlePanelKeydown(event: React.KeyboardEvent) {
    if (event.key === "Escape") {
      event.preventDefault();
      closePicker();
      return;
    }
    if (event.key !== "Tab" || !panelEl.current) return;
    const focusables = panelEl.current.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    if (focusables.length === 0) return;
    const first = focusables[0]!;
    const last = focusables[focusables.length - 1]!;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function handleSearchKeydown(event: React.KeyboardEvent) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlight((h) => Math.min(h + 1, filtered.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const target = filtered[highlight];
      if (target) chooseDepartment(target.id);
    }
  }

  function handleLevelKeydown(event: React.KeyboardEvent, index: number) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const next = event.key === "ArrowDown" ? index + 1 : index - 1;
      const clamped = Math.min(Math.max(next, 0), stepTwoLevels.length - 1);
      const items = panelEl.current?.querySelectorAll<HTMLElement>(
        "[data-level-option]",
      );
      items?.[clamped]?.focus();
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      track.goToStep(1);
    }
  }

  return (
    <div className="relative">
      <div className="auth-float">
        <button
          ref={triggerEl}
          type="button"
          role="combobox"
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-controls="course-year-panel"
          aria-invalid={Boolean(error || levelError)}
          aria-describedby={
            error || levelError ? "course-year-error" : undefined
          }
          aria-label={floating && !id ? label : undefined}
          id={id}
          disabled={disabled}
          onClick={() => (open ? closePicker() : openPicker())}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          className={`auth-input ${floating ? "auth-float-control" : ""} flex items-center justify-between gap-2 text-left`}
          data-active={floating ? isActive : undefined}
        >
          <span
            className={`min-w-0 truncate ${
              floating
                ? displayLabel
                  ? ""
                  : "invisible"
                : triggerLabel
                  ? ""
                  : "text-muted"
            }`}
          >
            {floating
              ? displayLabel
              : (triggerLabel ?? (loading ? "Loading…" : PLACEHOLDER))}
          </span>
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
            className="shrink-0 text-muted"
          >
            <path d="m7 10 5 5 5-5" />
          </svg>
        </button>
        {floating && id ? (
          <label
            htmlFor={id}
            className="auth-float-label"
            data-active={isActive}
            data-invalid={hasError}
          >
            {label}
          </label>
        ) : floating ? (
          <span
            aria-hidden="true"
            className="auth-float-label"
            data-active={isActive}
            data-invalid={hasError}
          >
            {label}
          </span>
        ) : null}
      </div>

      {staleNote ? (
        <p className="mt-1 text-xs text-muted">{staleNote}</p>
      ) : null}

      {open
        ? createPortal(
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
              <button
                type="button"
                tabIndex={-1}
                aria-label="Close course and year level selection"
                onClick={closePicker}
                className="absolute inset-0 cursor-default bg-ink/20"
              />

              <div
                ref={panelEl}
                id="course-year-panel"
                role="dialog"
                aria-modal="true"
                aria-label="Choose your course and year level"
                tabIndex={-1}
                onKeyDown={handlePanelKeydown}
                className="relative flex max-h-[min(76dvh,420px)] w-full max-w-[420px] flex-col overflow-y-auto overscroll-contain rounded-2xl border border-white/60 bg-white/95 shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_16px_48px_rgba(16,24,40,0.18),0_2px_8px_rgba(16,24,40,0.08)]"
                style={{ willChange: "transform, opacity" }}
              >
                <div
                  ref={track.viewportEl}
                  data-step={track.step}
                  data-viewport
                  className="overflow-hidden"
                  role="group"
                  aria-label="Swipe between the course and year level steps"
                  onPointerDown={track.onPointerDown}
                  onPointerMove={track.onPointerMove}
                  onPointerUp={track.onPointerUp}
                  onPointerCancel={track.onPointerCancel}
                  style={{ touchAction: "pan-y" }}
                >
                  <div
                    data-track
                    className="flex"
                    style={{
                      transform: `translateX(${track.trackX}px)`,
                      willChange: "transform",
                    }}
                  >
                    <CourseListSection
                      searchEl={searchEl}
                      query={query}
                      onQueryChange={(value) => {
                        setQuery(value);
                        setHighlight(0);
                      }}
                      onSearchKeyDown={handleSearchKeydown}
                      filtered={filtered}
                      highlight={highlight}
                      onHighlightChange={setHighlight}
                      departmentId={departmentId}
                      onChooseDepartment={chooseDepartment}
                      onListScroll={track.onListScroll}
                      isScrolling={track.isScrolling}
                    />

                    <YearLevelSection
                      displayDepartment={displayDepartment}
                      stepTwoLevels={stepTwoLevels}
                      yearLevel={yearLevel}
                      pickedDepartmentId={pickedDepartmentId}
                      departmentId={departmentId}
                      onChooseLevel={chooseLevel}
                      onLevelKeyDown={handleLevelKeydown}
                      onGoBack={() => track.goToStep(1)}
                      onListScroll={track.onListScroll}
                      isScrolling={track.isScrolling}
                    />
                  </div>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
