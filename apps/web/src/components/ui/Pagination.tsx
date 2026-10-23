/**
 * Shared by the admin users table and the officer submission list.
 * `QueuePagination` is a different control and is deliberately not folded in.
 *
 * The two call sites differ only in chrome, so `variant` picks the whole look
 * at once rather than exposing each gap and padding as its own prop.
 */
const LOOK = {
  bar: {
    root: "border-t border-border px-4 py-3",
    gap: "gap-3",
    labelGap: "gap-2",
    buttonPad: "px-2.5 py-1",
    counterPad: "px-2",
    nav: false,
  },
  inline: {
    root: "pt-1",
    gap: "gap-4",
    labelGap: "gap-1.5",
    buttonPad: "px-2 py-1",
    counterPad: "",
    nav: true,
  },
} as const;

export default function Pagination({
  page,
  pageSize,
  total,
  totalPages,
  onpagechange,
  onpagesizechange,
  label,
  variant = "bar",
  hideSizeSelect = false,
  hideNav = false,
}: {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  onpagechange: (page: number) => void;
  onpagesizechange: (size: number) => void;
  label: (total: number) => string;
  variant?: "bar" | "inline";
  hideSizeSelect?: boolean;
  hideNav?: boolean;
}) {
  const look = LOOK[variant];
  const arrows = (
    <>
      <button
        onClick={() => onpagechange(page - 1)}
        disabled={page <= 1}
        className={`rounded-md border border-border ${look.buttonPad} text-xs text-ink transition-[transform,background-color] duration-100 ease-out hover:bg-surface active:scale-[0.97] disabled:opacity-40`}
        aria-label="Previous page"
      >
        ←
      </button>
      <span className={`${look.counterPad} text-xs text-muted tabular-nums`}>
        {page} / {totalPages}
      </span>
      <button
        onClick={() => onpagechange(page + 1)}
        disabled={page >= totalPages}
        className={`rounded-md border border-border ${look.buttonPad} text-xs text-ink transition-[transform,background-color] duration-100 ease-out hover:bg-surface active:scale-[0.97] disabled:opacity-40`}
        aria-label="Next page"
      >
        →
      </button>
    </>
  );

  return (
    <div
      className={`flex flex-wrap items-center justify-between ${look.gap} ${look.root}`}
    >
      <p className="text-xs text-muted tabular-nums">{label(total)}</p>
      <div className={`flex items-center ${look.gap}`}>
        {!hideSizeSelect && (
          <label
            className={`flex items-center ${look.labelGap} text-xs text-muted`}
          >
            Per page
            <select
              value={pageSize}
              onChange={(e) => onpagesizechange(Number(e.currentTarget.value))}
              className="rounded-md border border-border bg-surface px-2 py-1 text-xs text-ink"
            >
              <option value="25">25</option>
              <option value="50">50</option>
              <option value="100">100</option>
            </select>
          </label>
        )}
        {!hideNav &&
          (look.nav ? (
            <nav className="flex items-center gap-1.5" aria-label="Pagination">
              {arrows}
            </nav>
          ) : (
            <div className="flex items-center gap-1">{arrows}</div>
          ))}
      </div>
    </div>
  );
}
