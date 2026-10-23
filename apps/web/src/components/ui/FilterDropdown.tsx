import { useEffect, useRef, useState } from "react";
import { prefersReducedMotion } from "$lib/motion";
import "./FilterDropdown.css";

type Option = { value: string; label: string };

export default function FilterDropdown({
  value,
  options,
  ariaLabel,
  onchange,
  id,
}: {
  value: string;
  options: readonly Option[];
  ariaLabel: string;
  onchange: (v: string) => void;
  id?: string;
}) {
  const currentLabel = options.find((o) => o.value === value)?.label ?? value;

  const [open, setOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const root = useRef<HTMLDivElement | null>(null);
  const triggerEl = useRef<HTMLButtonElement | null>(null);
  const listEl = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    listEl.current
      ?.querySelector<HTMLElement>(`[data-index="${focusedIndex}"]`)
      ?.focus();
  }, [open, focusedIndex]);

  function toggle() {
    if (open) close();
    else openMenu();
  }

  function openMenu(focusIdx?: number) {
    setOpen(true);
    const idx = focusIdx ?? options.findIndex((o) => o.value === value);
    setFocusedIndex(idx >= 0 ? idx : 0);
  }

  function close(focusTrigger = true) {
    if (!open) return;
    setOpen(false);
    setFocusedIndex(-1);
    if (focusTrigger) triggerEl.current?.focus();
  }

  function select(val: string) {
    if (val !== value) onchange(val);
    close();
  }

  function moveFocus(delta: number) {
    if (options.length === 0) return;
    let next = focusedIndex + delta;
    if (next < 0) next = options.length - 1;
    if (next >= options.length) next = 0;
    setFocusedIndex(next);
  }

  function jumpTo(index: number) {
    setFocusedIndex(index);
  }

  function onTriggerKeydown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) {
        openMenu(e.key === "ArrowUp" ? options.length - 1 : 0);
      } else {
        moveFocus(e.key === "ArrowDown" ? 1 : -1);
      }
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (!open) openMenu();
      else {
        const opt = options[focusedIndex];
        if (opt) select(opt.value);
      }
    } else if (e.key === "Escape" && open) {
      e.preventDefault();
      close();
    }
  }

  function onListKeydown(e: React.KeyboardEvent) {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        moveFocus(1);
        break;
      case "ArrowUp":
        e.preventDefault();
        moveFocus(-1);
        break;
      case "Home":
        e.preventDefault();
        jumpTo(0);
        break;
      case "End":
        e.preventDefault();
        jumpTo(options.length - 1);
        break;
      case "Enter":
      case " ": {
        e.preventDefault();
        const opt = options[focusedIndex];
        if (opt) select(opt.value);
        break;
      }
      case "Escape":
        e.preventDefault();
        close();
        break;
      case "Tab":
        close(false);
        break;
    }
  }

  useEffect(() => {
    if (!open) return;
    function onPointerDown(ev: PointerEvent) {
      if (root.current && !root.current.contains(ev.target as Node))
        close(false);
    }
    function onKeyDown(ev: KeyboardEvent) {
      if (ev.key === "Escape") close();
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <div className="relative" ref={root} id={id}>
      <button
        ref={triggerEl}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={toggle}
        onKeyDown={onTriggerKeydown}
        className={`group inline-flex min-w-[148px] items-center justify-between gap-2 rounded-lg border border-border bg-surface-raised px-3 py-2 text-left text-sm font-normal text-ink transition-colors duration-150 ease-out hover:bg-surface active:bg-surface ${open ? "bg-surface" : ""}`}
      >
        <span className="truncate">{currentLabel}</span>
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className={`shrink-0 text-muted/70 transition-transform duration-150 ease-out ${open ? "rotate-180" : ""}`}
          style={prefersReducedMotion() ? { transition: "none" } : undefined}
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {open ? (
        <div
          ref={listEl}
          role="listbox"
          aria-label={ariaLabel}
          tabIndex={-1}
          onKeyDown={onListKeydown}
          className="dropdown-panel absolute left-0 top-full z-50 mt-1.5 min-w-full rounded-lg border border-border bg-surface-raised p-1 backdrop-blur-md will-change-transform"
          style={{ transformOrigin: "top left", minWidth: "100%" }}
        >
          {options.map((opt, i) => {
            const selected = opt.value === value;
            const focused = i === focusedIndex;
            return (
              <button
                key={opt.value}
                type="button"
                role="option"
                aria-selected={selected}
                data-index={i}
                tabIndex={focused ? 0 : -1}
                onClick={() => select(opt.value)}
                onPointerDown={(e) => e.preventDefault()}
                className={`flex w-full items-center justify-between gap-3 rounded-md px-3 py-1.5 text-left text-sm leading-5 transition-colors duration-100 ease-out ${
                  selected
                    ? "bg-primary text-white"
                    : focused
                      ? "bg-surface text-ink"
                      : "text-ink hover:bg-surface"
                }`}
              >
                <span className={`truncate ${selected ? "font-medium" : ""}`}>
                  {opt.label}
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
                    className="shrink-0"
                  >
                    <path d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  <span
                    className="h-1.5 w-1.5 shrink-0 rounded-full bg-transparent"
                    aria-hidden="true"
                  />
                )}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
