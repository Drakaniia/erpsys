import { useEffect, useId, useRef, useState } from "react";
import { useDropdownPanel } from "$lib/ui/use-dropdown-panel";
import "./FilterDropdown.css";

type Option = { value: string; label: string };

export default function FilterDropdown({
  value,
  options,
  ariaLabel,
  onchange,
  id,
  disabled = false,
  compact = false,
}: {
  value: string;
  options: readonly Option[];
  ariaLabel: string;
  onchange: (v: string) => void;
  id?: string;
  disabled?: boolean;
  compact?: boolean;
}) {
  const listId = useId();
  const typeahead = useRef({ text: "", time: 0 });
  const currentLabel = options.find((o) => o.value === value)?.label ?? value;

  const [open, setOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);
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

  function toggle() {
    if (open) close();
    else openMenu();
  }

  function openMenu(focusIdx?: number) {
    if (
      disabled ||
      triggerEl.current?.matches(":disabled") ||
      options.length === 0
    )
      return;
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
        e.stopPropagation();
        close();
        break;
      case "Tab":
        triggerEl.current?.focus();
        close(false);
        break;
      default: {
        if (e.key.length !== 1 || e.ctrlKey || e.altKey || e.metaKey) break;
        const now = Date.now();
        typeahead.current.text =
          now - typeahead.current.time > 600
            ? e.key
            : typeahead.current.text + e.key;
        typeahead.current.time = now;
        const query = typeahead.current.text.toLocaleLowerCase();
        const index = options.findIndex((option) =>
          option.label.toLocaleLowerCase().startsWith(query),
        );
        if (index >= 0) {
          e.preventDefault();
          setFocusedIndex(index);
        }
      }
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
    <div className="relative min-w-0" ref={root}>
      <button
        ref={triggerEl}
        type="button"
        role="combobox"
        id={id}
        value={value}
        disabled={disabled}
        aria-controls={open ? listId : undefined}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={toggle}
        onKeyDown={onTriggerKeydown}
        className={`dropdown-trigger ${compact ? "dropdown-trigger--compact" : ""}`}
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
          className="dropdown-chevron"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {open ? (
        <div
          ref={listEl}
          id={listId}
          popover="manual"
          role="listbox"
          aria-label={ariaLabel}
          tabIndex={-1}
          onKeyDown={onListKeydown}
          className="dropdown-panel apple-scrollbar"
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
                onPointerMove={() => setFocusedIndex(i)}
                className="dropdown-option"
                data-focused={focused}
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
                    className="shrink-0 text-primary"
                  >
                    <path d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  <span className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                )}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
