import {
  sortAria,
  type SortDir,
  type StudentSort,
} from "$lib/instructor/students";

export default function SortHeader({
  column,
  label,
  sort,
  dir,
  extraClass = "",
  onsort,
}: {
  column: StudentSort;
  label: string;
  sort: StudentSort;
  dir: SortDir;
  extraClass?: string;
  onsort: (column: StudentSort) => void;
}) {
  const active = sort === column;
  return (
    <th
      scope="col"
      aria-sort={sortAria(column, sort, dir)}
      className={`px-3 py-2 text-left text-[11px] font-medium uppercase tracking-wide text-muted ${extraClass}`}
    >
      <button
        type="button"
        onClick={() => onsort(column)}
        className={`press inline-flex items-center gap-1 rounded transition-colors hover:text-ink ${active ? "text-ink" : ""}`}
      >
        {label}
        <svg
          width="10"
          height="10"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          aria-hidden="true"
          className={`transition-opacity ${active ? "opacity-100" : "opacity-0"}`}
          style={
            active && dir === "desc"
              ? { transform: "rotate(180deg)" }
              : undefined
          }
        >
          <path
            d="M12 19V5M5 12l7-7 7 7"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
    </th>
  );
}
