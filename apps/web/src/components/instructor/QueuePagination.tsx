import { useMemo } from "react";

export default function QueuePagination({
  currentPage,
  totalPages,
  onPageChange,
}: {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}) {
  const pageNumbers = useMemo(() => {
    const pages: (number | "ellipsis")[] = [];
    const maxVisible = 5;
    if (totalPages <= maxVisible) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      if (currentPage > 3) pages.push("ellipsis");
      const start = Math.max(2, currentPage - 1);
      const end = Math.min(totalPages - 1, currentPage + 1);
      for (let i = start; i <= end; i++) pages.push(i);
      if (currentPage < totalPages - 2) pages.push("ellipsis");
      if (totalPages > 1) pages.push(totalPages);
    }
    return pages;
  }, [currentPage, totalPages]);

  if (totalPages <= 1) return null;
  const canGoPrevious = currentPage > 1;
  const canGoNext = currentPage < totalPages;

  return (
    <nav
      className="flex items-center justify-center gap-1"
      aria-label="Pagination"
    >
      <button
        type="button"
        onClick={() => onPageChange(currentPage - 1)}
        disabled={!canGoPrevious}
        aria-label="Previous page"
        className="press flex h-9 w-9 items-center justify-center rounded-lg text-sm text-muted transition-[transform,background-color,color] duration-100 ease-out hover:bg-surface hover:text-ink disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-muted"
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
        >
          <path d="M15 18l-6-6 6-6" />
        </svg>
      </button>
      {pageNumbers.map((page, idx) =>
        page === "ellipsis" ? (
          <span
            key={`ellipsis-${idx}`}
            className="flex h-9 w-9 items-center justify-center text-sm text-muted"
            aria-hidden="true"
          >
            ···
          </span>
        ) : (
          <button
            key={`page-${page}`}
            type="button"
            onClick={() => onPageChange(page)}
            aria-label={`Page ${page}`}
            aria-current={currentPage === page ? "page" : undefined}
            className={`press flex h-9 min-w-9 items-center justify-center rounded-lg px-2 text-sm tabular-nums transition-[transform,background-color,color] duration-100 ease-out ${currentPage === page ? "bg-primary font-medium text-white" : "text-muted hover:bg-surface hover:text-ink"}`}
          >
            {page}
          </button>
        ),
      )}
      <button
        type="button"
        onClick={() => onPageChange(currentPage + 1)}
        disabled={!canGoNext}
        aria-label="Next page"
        className="press flex h-9 w-9 items-center justify-center rounded-lg text-sm text-muted transition-[transform,background-color,color] duration-100 ease-out hover:bg-surface hover:text-ink disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-muted"
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
        >
          <path d="M9 18l6-6-6-6" />
        </svg>
      </button>
    </nav>
  );
}
