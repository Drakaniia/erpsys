import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { prefersReducedMotion } from "$lib/motion";
import { usePresence } from "$lib/ui/use-presence";
import {
  academicYearOptionLabel,
  type AcademicYearOption,
} from "$lib/auth/register-placement";

const MENU_MAX_HEIGHT = 248;
const MENU_GAP = 8;
const EDGE_PADDING = 8;
const ROW_HEIGHT = 40;

interface Anchor {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
}

export default function AcademicYearSelect({
  value = "",
  options = [],
  loading = false,
  disabled = false,
  invalid = false,
  describedBy,
  id,
  label,
  placeholder = "Select your academic year",
  variant = "auth",
  onselect,
  onblur,
}: {
  value?: string;
  options?: readonly AcademicYearOption[];
  loading?: boolean;
  disabled?: boolean;
  invalid?: boolean;
  describedBy?: string;
  id?: string;
  label?: string;
  placeholder?: string;
  variant?: "auth" | "onboarding";
  onselect: (id: string) => void;
  onblur?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [focused, setFocused] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const triggerEl = useRef<HTMLButtonElement | null>(null);
  const listEl = useRef<HTMLDivElement | null>(null);

  const reduceMotion = prefersReducedMotion();

  const selectedOption = options.find((o) => o.id === value);
  // Floating mode (label provided): active while focused, open, or holding
  // a selection, so a chosen year keeps the label upper-left on blur.
  const floating = label !== undefined;
  const isActive = focused || open || selectedOption !== undefined;
  const displayText = selectedOption
    ? academicYearOptionLabel(selectedOption)
    : isActive
      ? loading
        ? "Loading…"
        : placeholder
      : "";
  const triggerText = selectedOption
    ? academicYearOptionLabel(selectedOption)
    : loading
      ? "Loading…"
      : placeholder;

  /**
   * The menu is a `fixed` top layer measured against the viewport, not a
   * positioned child of the trigger. The original control was a native
   * `<select>`, whose list the OS drew in a popup that ignored the
   * field's width, padding, and radius - that misalignment could not be
   * corrected from CSS, so the control is custom. `fixed` also keeps the
   * panel out of a scroll container's clipping and out of a transformed
   * ancestor's containing block, both of which the auth card has.
   */
  function position(rect: DOMRect) {
    const spaceBelow =
      window.innerHeight - rect.bottom - MENU_GAP - EDGE_PADDING;
    const spaceAbove = rect.top - MENU_GAP - EDGE_PADDING;
    const needed = Math.min(MENU_MAX_HEIGHT, options.length * ROW_HEIGHT + 8);
    // Flip only when below genuinely cannot show the list and above has
    // more room, so a short list that fits either way stays under the
    // field where it is expected.
    const dropUp = spaceBelow < needed && spaceAbove > spaceBelow;
    const maxHeight = Math.max(
      ROW_HEIGHT + 8,
      Math.min(MENU_MAX_HEIGHT, dropUp ? spaceAbove : spaceBelow),
    );
    const top = dropUp
      ? rect.top - MENU_GAP - maxHeight
      : rect.bottom + MENU_GAP;
    const width = Math.min(rect.width, window.innerWidth - EDGE_PADDING * 2);
    const left = Math.min(
      Math.max(EDGE_PADDING, rect.left),
      window.innerWidth - width - EDGE_PADDING,
    );
    setAnchor({ top, left, width, maxHeight });
  }

  function focusOption() {
    if (focusedIndex < 0) return;
    listEl.current
      ?.querySelector<HTMLElement>(`[data-index="${focusedIndex}"]`)
      ?.focus();
  }

  useEffect(() => {
    if (open) focusOption();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, focusedIndex]);

  function openMenu(focusIndex?: number) {
    setOpen(true);
    setFocusedIndex(
      focusIndex ??
        Math.max(
          0,
          options.findIndex((o) => o.id === value),
        ),
    );
    if (triggerEl.current) position(triggerEl.current.getBoundingClientRect());
  }

  function close(restoreFocus = true) {
    if (!open) return;
    setOpen(false);
    setAnchor(null);
    setFocusedIndex(-1);
    if (restoreFocus) {
      triggerEl.current?.focus();
      onblur?.();
    }
  }

  function select(optionId: string) {
    if (optionId !== value) onselect(optionId);
    close();
  }

  function moveFocus(index: number) {
    if (options.length === 0) return;
    setFocusedIndex((index + options.length) % options.length);
  }

  function onTriggerKeydown(event: React.KeyboardEvent) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (open)
        setFocusedIndex(
          (i) =>
            (i + (event.key === "ArrowDown" ? 1 : -1) + options.length) %
            options.length,
        );
      else openMenu(event.key === "ArrowUp" ? options.length - 1 : 0);
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (!open) {
        openMenu();
        return;
      }
      const option = options[focusedIndex];
      if (option) select(option.id);
    } else if (event.key === "Escape" && open) {
      event.preventDefault();
      close();
    }
  }

  function onListKeydown(event: React.KeyboardEvent) {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        moveFocus(focusedIndex + 1);
        break;
      case "ArrowUp":
        event.preventDefault();
        moveFocus(focusedIndex - 1);
        break;
      case "Home":
        event.preventDefault();
        moveFocus(0);
        break;
      case "End":
        event.preventDefault();
        moveFocus(options.length - 1);
        break;
      case "Enter":
      case " ": {
        event.preventDefault();
        const option = options[focusedIndex];
        if (option) select(option.id);
        break;
      }
      case "Escape":
        event.preventDefault();
        close();
        break;
      case "Tab":
        close(false);
        break;
    }
  }

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (
        listEl.current?.contains(target) ||
        triggerEl.current?.contains(target)
      )
        return;
      close(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") close();
    }
    function onViewportChange() {
      // A `fixed` panel does not follow its trigger, so scrolling or
      // resizing would otherwise leave it anchored to a stale rect.
      if (triggerEl.current)
        position(triggerEl.current.getBoundingClientRect());
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("scroll", onViewportChange, true);
    window.addEventListener("resize", onViewportChange);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("scroll", onViewportChange, true);
      window.removeEventListener("resize", onViewportChange);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // No exit animation: Svelte deferred removal of the portal node and would
  // strand it in `body`, so the port keeps the enter-only transition too.
  const menu = usePresence(open, { scale: 0.96, fade: true, duration: 200 });

  return (
    <>
      <div className="auth-float">
        <button
          ref={triggerEl}
          type="button"
          role="combobox"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls="academic-year-listbox"
          aria-invalid={invalid}
          aria-describedby={describedBy}
          aria-label={floating && !id ? label : undefined}
          id={id}
          disabled={disabled}
          onClick={() => (open ? close() : openMenu())}
          onKeyDown={onTriggerKeydown}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          className={`${
            variant === "auth"
              ? "auth-input"
              : "h-11 w-full rounded-xl border bg-surface text-[15px] outline-none transition-colors duration-140 ease-out focus:border-primary focus:ring-2 focus:ring-primary/25"
          } ${floating ? "auth-float-control" : ""} flex items-center justify-between gap-2 text-left disabled:cursor-not-allowed ${
            variant === "onboarding"
              ? invalid
                ? "border-error"
                : "border-border"
              : ""
          }`}
          data-active={floating ? isActive : undefined}
        >
          <span
            className={`min-w-0 truncate ${
              floating
                ? displayText
                  ? ""
                  : "invisible"
                : selectedOption
                  ? ""
                  : "text-muted"
            }`}
          >
            {floating ? displayText : triggerText}
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
            className={`shrink-0 text-muted transition-transform duration-150 ease-out ${
              open ? "rotate-180" : ""
            }`}
            style={reduceMotion ? { transition: "none" } : undefined}
          >
            <path d="m7 10 5 5 5-5" />
          </svg>
        </button>
        {floating && id ? (
          <label
            htmlFor={id}
            className="auth-float-label"
            data-active={isActive}
            data-invalid={invalid}
          >
            {label}
          </label>
        ) : floating ? (
          <span
            aria-hidden="true"
            className="auth-float-label"
            data-active={isActive}
            data-invalid={invalid}
          >
            {label}
          </span>
        ) : null}
      </div>

      {menu.mounted && anchor
        ? createPortal(
            <div
              data-testid="academic-year-menu"
              className="fixed z-[100] flex flex-col overflow-hidden rounded-2xl border border-white/60 bg-white/95 p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_16px_48px_rgba(16,24,40,0.18),0_2px_8px_rgba(16,24,40,0.08)]"
              style={{
                top: anchor.top,
                left: anchor.left,
                width: anchor.width,
                maxHeight: anchor.maxHeight,
                willChange: "transform, opacity",
                ...menu.style,
              }}
            >
              <div
                ref={listEl}
                id="academic-year-listbox"
                role="listbox"
                tabIndex={-1}
                aria-label="Academic year"
                onKeyDown={onListKeydown}
                className="apple-scrollbar overflow-y-auto overscroll-contain"
              >
                {options.map((option, index) => {
                  const selected = option.id === value;
                  const isFocused = index === focusedIndex;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      role="option"
                      aria-selected={selected}
                      data-index={index}
                      tabIndex={isFocused ? 0 : -1}
                      onClick={() => select(option.id)}
                      onPointerDown={(event) => event.preventDefault()}
                      onMouseEnter={() => setFocusedIndex(index)}
                      className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left text-sm text-ink transition-colors duration-100 ease-out ${
                        isFocused ? "bg-ink/[0.04]" : ""
                      }`}
                    >
                      <span className="min-w-0 truncate font-medium">
                        {academicYearOptionLabel(option)}
                      </span>
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
                          className="shrink-0 text-primary"
                        >
                          <path d="M20 6 9 17l-5-5" />
                        </svg>
                      ) : (
                        <span
                          className="h-3.5 w-3.5 shrink-0"
                          aria-hidden="true"
                        />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
