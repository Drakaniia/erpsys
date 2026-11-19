import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useDropdownPanel } from "$lib/ui/use-dropdown-panel";
import type { MultiSelectOption } from "$lib/ui/multi-select";
import "./FilterDropdown.css";

export default function MultiSelectDropdown({
  label,
  placeholder,
  options,
  selected,
  onchange,
  id,
  panelWidth = "min-w-full",
}: {
  label: string;
  placeholder: string;
  options: readonly MultiSelectOption[];
  selected: readonly string[];
  onchange: (next: string[]) => void;
  id?: string;
  panelWidth?: string;
}) {
  const listId = useId();
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const summary = (() => {
    if (selected.length === 0) return placeholder;
    const first = options.find((o) => o.value === selected[0]);
    const name = first?.label ?? selected[0];
    return selected.length === 1 ? name : `${name} +${selected.length - 1}`;
  })();

  const [open, setOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(0);
  const root = useRef<HTMLDivElement | null>(null);
  const triggerEl = useRef<HTMLButtonElement | null>(null);
  const listEl = useRef<HTMLDivElement | null>(null);
  useDropdownPanel(open, triggerEl, listEl);

  useEffect(() => {
    if (!open) return;
    listEl.current
      ?.querySelector<HTMLElement>(`[data-index="${focusedIndex}"]`)
      ?.focus();
  }, [open, focusedIndex]);

  function openMenu() {
    if (options.length === 0) return;
    setOpen(true);
    setFocusedIndex(
      Math.max(
        0,
        options.findIndex((o) => selectedSet.has(o.value)),
      ),
    );
  }

  function close(focusTrigger = true) {
    if (!open) return;
    setOpen(false);
    if (focusTrigger) triggerEl.current?.focus();
  }

  function toggle() {
    if (open) close();
    else openMenu();
  }

  function toggleValue(value: string) {
    onchange(
      selectedSet.has(value)
        ? selected.filter((v) => v !== value)
        : [...selected, value],
    );
  }

  function clearAll() {
    onchange([]);
    listEl.current
      ?.querySelector<HTMLElement>(`[data-index="${focusedIndex}"]`)
      ?.focus();
  }

  function moveFocus(delta: number) {
    if (options.length === 0) return;
    setFocusedIndex((i) => (i + delta + options.length) % options.length);
  }

  function onTriggerKeydown(e: React.KeyboardEvent) {
    if (
      e.key === "ArrowDown" ||
      e.key === "ArrowUp" ||
      e.key === "Enter" ||
      e.key === " "
    ) {
      e.preventDefault();
      if (!open) openMenu();
      else {
        const opt = options[focusedIndex];
        if (opt) toggleValue(opt.value);
      }
    } else if (e.key === "Escape" && open) {
      e.preventDefault();
      e.stopPropagation();
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
        setFocusedIndex(0);
        break;
      case "End":
        e.preventDefault();
        setFocusedIndex(options.length - 1);
        break;
      case "Enter":
      case " ": {
        e.preventDefault();
        const opt = options[focusedIndex];
        if (opt) toggleValue(opt.value);
        break;
      }
      case "Escape":
        e.preventDefault();
        e.stopPropagation();
        close();
        break;
      case "Tab":
        triggerEl.current?.focus();
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

    document.addEventListener("pointerdown", onPointerDown);

    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
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
        aria-controls={open ? listId : undefined}
        aria-label={label}
        onClick={toggle}
        onKeyDown={onTriggerKeydown}
        className="dropdown-trigger"
        data-selected={selected.length > 0}
      >
        <span className="truncate">{summary}</span>
        {selected.length > 1 ? (
          <span className="shrink-0 rounded-full bg-primary/10 px-1.5 text-[11px] font-semibold tabular-nums text-primary">
            {selected.length}
          </span>
        ) : null}
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
          className="dropdown-chevron"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {open ? (
        <div
          ref={listEl}
          popover="manual"
          tabIndex={-1}
          onKeyDown={onListKeydown}
          className={`dropdown-panel apple-scrollbar ${panelWidth}`}
        >
          <div
            id={listId}
            role="listbox"
            aria-label={label}
            aria-multiselectable="true"
          >
            {options.map((opt, i) => {
              const checked = selectedSet.has(opt.value);
              return (
                <button
                  key={opt.value}
                  type="button"
                  role="option"
                  aria-selected={checked}
                  data-index={i}
                  tabIndex={i === focusedIndex ? 0 : -1}
                  title={opt.description ?? undefined}
                  onClick={() => toggleValue(opt.value)}
                  onPointerDown={(e) => e.preventDefault()}
                  onPointerMove={() => setFocusedIndex(i)}
                  className="dropdown-option"
                  data-focused={i === focusedIndex}
                >
                  <span
                    aria-hidden="true"
                    className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-[5px] border-[1.5px] transition-colors ${
                      checked
                        ? "border-primary bg-primary text-white"
                        : "border-border bg-surface-raised"
                    }`}
                  >
                    {checked ? (
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
                  <span
                    className={`min-w-0 flex-1 truncate ${opt.muted ? "text-muted/70" : ""}`}
                  >
                    {opt.label}
                    {opt.muted ? (
                      <span className="ml-1 text-[11px] text-muted/60">
                        · inactive
                      </span>
                    ) : null}
                  </span>
                  {opt.hint ? (
                    <span className="shrink-0 text-[11px] tabular-nums text-muted/70">
                      {opt.hint}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>

          {selected.length > 0 ? (
            <div className="mt-1 border-t border-border/60 pt-1">
              <button
                type="button"
                onClick={clearAll}
                className="w-full rounded-md px-2.5 py-1.5 text-left text-xs text-muted transition-colors hover:bg-surface hover:text-ink"
              >
                Clear {label.toLowerCase()}
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
