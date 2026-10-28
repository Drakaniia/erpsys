import { useEffect, useRef, useState } from "react";
import FilterDropdown from "../ui/FilterDropdown";

type Status = "ALL" | "PENDING" | "SUBMITTED" | "VERIFIED" | "RETURNED";
type Evidence = "ALL" | "HAS" | "NONE";
type Range = "ALL" | "today" | "7d" | "30d" | "year";

const statusOptions = [
  { value: "ALL", label: "All statuses" },
  { value: "PENDING", label: "Pending" },
  { value: "SUBMITTED", label: "Submitted" },
  { value: "RETURNED", label: "Returned" },
  { value: "VERIFIED", label: "Verified" },
] as const;

const evidenceOptions = [
  { value: "ALL", label: "Any evidence" },
  { value: "HAS", label: "Has evidence" },
  { value: "NONE", label: "No evidence" },
] as const;

const rangeOptions = [
  { value: "ALL", label: "Any time" },
  { value: "today", label: "Today" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "year", label: "This academic year" },
] as const;

export default function SubmissionFilters({
  q = "",
  status = "ALL",
  evidence = "ALL",
  range = "ALL",
  unreadOnly = false,
  showEvidence = true,
  onqchange,
  onstatuschange,
  onevidencechange,
  onrangechange,
  onunreadtoggle,
}: {
  q?: string;
  status?: Status;
  evidence?: Evidence;
  range?: Range;
  unreadOnly?: boolean;
  showEvidence?: boolean;
  onqchange: (q: string) => void;
  onstatuschange: (s: Status) => void;
  onevidencechange: (e: Evidence) => void;
  onrangechange: (r: Range) => void;
  onunreadtoggle: () => void;
}) {
  const [searchInput, setSearchInput] = useState(q);
  const [searchFocused, setSearchFocused] = useState(false);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );

  useEffect(() => {
    if (!searchFocused) setSearchInput(q);
  }, [q, searchFocused]);

  useEffect(
    () => () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    },
    [],
  );

  function onSearchInput(value: string) {
    setSearchInput(value);
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => onqchange(value.trim()), 300);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative min-w-[220px] flex-1">
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
          className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted"
        >
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.3-4.3" />
        </svg>
        <input
          type="search"
          value={searchInput}
          onFocus={() => setSearchFocused(true)}
          onBlur={() => setSearchFocused(false)}
          onChange={(e) => onSearchInput(e.currentTarget.value)}
          placeholder="Search by name or student number"
          aria-label="Search submissions"
          className="h-8 w-full rounded-md border border-border bg-surface pl-8 pr-2 text-sm text-ink placeholder:text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        />
      </div>
      <FilterDropdown
        value={status}
        options={[...statusOptions]}
        ariaLabel="Filter by status"
        onchange={(v) => onstatuschange(v as Status)}
      />
      {showEvidence && (
        <FilterDropdown
          value={evidence}
          options={[...evidenceOptions]}
          ariaLabel="Filter by evidence"
          onchange={(v) => onevidencechange(v as Evidence)}
        />
      )}
      <FilterDropdown
        value={range}
        options={[...rangeOptions]}
        ariaLabel="Filter by date"
        onchange={(v) => onrangechange(v as Range)}
      />
      <button
        type="button"
        onClick={onunreadtoggle}
        aria-pressed={unreadOnly}
        title="Show only submissions not yet opened"
        className={`flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium transition-colors duration-200 ease-out ${
          unreadOnly
            ? "border-primary bg-primary text-white"
            : "border-border bg-surface text-muted hover:text-ink"
        }`}
      >
        <span
          aria-hidden="true"
          className={`h-1.5 w-1.5 rounded-full ${unreadOnly ? "bg-white" : "bg-primary"}`}
        ></span>
        Unread only
      </button>
    </div>
  );
}
