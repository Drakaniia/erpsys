export default function UserBulkBar({
  selectedCount,
  promotableCount,
  demotableCount,
  deleteCount,
  onpromote,
  ondemote,
  ondelete,
  onclear,
}: {
  selectedCount: number;
  promotableCount: number;
  demotableCount: number;
  deleteCount: number;
  onpromote: () => void;
  ondemote: () => void;
  ondelete: () => void;
  onclear: () => void;
}) {
  if (!(selectedCount > 0)) return null;
  return (
    <div className="fixed bottom-6 left-1/2 z-40 -translate-x-1/2">
      <div className="flex items-center gap-3 rounded-full border border-border bg-ink px-4 py-2 text-sm text-white shadow-lg">
        <span className="tabular-nums">{selectedCount} selected</span>
        <span className="h-4 w-px bg-white/20" aria-hidden="true" />
        <button
          onClick={onpromote}
          disabled={promotableCount === 0}
          className="rounded-full px-3 py-1 text-xs font-medium text-white/80 hover:bg-white/10 hover:text-white disabled:opacity-40"
        >
          Promote {promotableCount} to officer
        </button>
        <button
          onClick={ondemote}
          disabled={demotableCount === 0}
          className="rounded-full px-3 py-1 text-xs font-medium text-white/80 hover:bg-white/10 disabled:opacity-40"
        >
          Demote {demotableCount} to student
        </button>
        <button
          onClick={ondelete}
          disabled={deleteCount === 0}
          className="rounded-full bg-error px-3 py-1 text-xs font-medium text-white transition-[transform,background-color] duration-100 ease-out hover:bg-error/90 active:scale-[0.97] disabled:opacity-40"
        >
          Delete {deleteCount}
        </button>
        <button
          onClick={onclear}
          aria-label="Clear selection"
          className="rounded-full p-1 text-white/60 hover:bg-white/10 hover:text-white"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <path d="M18 6 6 18" />
            <path d="m6 6 12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}
