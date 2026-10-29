import { useEffect, useRef, useState } from "react";
import type { OutsideFilter, RoleFilter } from "$lib/admin/types";
import FilterDropdown from "../ui/FilterDropdown";

export default function UserFilters({
  q,
  role,
  outside,
  onqchange,
  onrolechange,
  onoutsidechange,
  onrefresh,
  refreshing = false,
}: {
  q: string;
  role: RoleFilter;
  outside: OutsideFilter;
  onqchange: (q: string) => void;
  onrolechange: (role: RoleFilter) => void;
  onoutsidechange: (outside: OutsideFilter) => void;
  onrefresh: () => void;
  refreshing?: boolean;
}) {
  const roleOptions: ReadonlyArray<{ value: RoleFilter; label: string }> = [
    { value: "ALL", label: "All roles" },
    { value: "STUDENT", label: "Student" },
    { value: "SBO_OFFICER", label: "SBO Officer" },
    { value: "ENROLLMENT_ADVISER", label: "Instructor" },
    { value: "ADMIN", label: "Admin" },
  ];

  const outsideOptions: ReadonlyArray<{ value: OutsideFilter; label: string }> =
    [
      { value: "ALL", label: "Inside & outside" },
      { value: "INSIDE", label: "Inside org" },
      { value: "OUTSIDE", label: "Outside org" },
    ];

  const [searchInput, setSearchInput] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );

  useEffect(() => {
    if (!searchFocused) setSearchInput(q);
  }, [q, searchFocused]);

  useEffect(() => {
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, []);

  function onSearchInput(value: string) {
    setSearchInput(value);
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => onqchange(value.trim()), 300);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative min-w-[260px] flex-1">
        <svg
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          aria-hidden="true"
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
          placeholder="Search by name, student number, or email"
          aria-label="Search users"
          className="w-full rounded-lg border border-border bg-surface-raised py-2 pl-9 pr-3 text-sm text-ink placeholder:text-muted"
        />
      </div>

      <FilterDropdown
        value={role}
        options={
          roleOptions as unknown as Array<{ value: string; label: string }>
        }
        ariaLabel="Filter by role"
        onchange={(v: string) => onrolechange(v as RoleFilter)}
      />

      <FilterDropdown
        value={outside}
        options={
          outsideOptions as unknown as Array<{ value: string; label: string }>
        }
        ariaLabel="Filter by organization"
        onchange={(v: string) => onoutsidechange(v as OutsideFilter)}
      />

      <button
        onClick={onrefresh}
        aria-label={refreshing ? "Refreshing…" : "Refresh users"}
        aria-busy={refreshing}
        disabled={refreshing}
        className="rounded-lg border border-border px-3 py-2 text-sm text-muted hover:bg-surface hover:text-ink disabled:opacity-60"
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
          className={refreshing ? "animate-spin" : ""}
        >
          <path d="M21 12a9 9 0 1 1-2.64-6.36" />
          <path d="M21 3v6h-6" />
        </svg>
        <span className="sr-only">Refresh</span>
      </button>
    </div>
  );
}
