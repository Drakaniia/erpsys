import type { ReactNode } from "react";

export type EmptyStateIcon = "inbox" | "form" | "calendar" | "user";

/**
 * `variant` picks the chrome: `plain` is the centred column the officer,
 * instructor and student panels use, `card` is the bordered `role="status"`
 * panel the reports screens use for the no-active-year state.
 */
export default function EmptyState({
  title,
  hint,
  icon = "inbox",
  action,
  variant = "plain",
}: {
  title: string;
  hint?: string;
  icon?: EmptyStateIcon;
  action?: ReactNode;
  variant?: "plain" | "card";
  // ponytail: `fade` prop accepted for API compat (ProfileTab passes
  // fade={false}); the 200ms entry fade is dropped — the settled DOM is identical.
  fade?: boolean;
}) {
  const isCard = variant === "card";
  const titleClass = isCard
    ? "text-base font-semibold tracking-tight text-ink"
    : "text-sm font-medium text-ink";
  const hintClass = isCard
    ? "max-w-sm text-sm text-muted"
    : "max-w-sm text-xs text-muted";

  return (
    <div
      className={
        isCard
          ? "flex flex-col items-center gap-2 rounded-xl border border-border bg-surface-raised px-6 py-10 text-center"
          : "flex flex-col items-center gap-2 px-6 py-14 text-center"
      }
      role={isCard ? "status" : undefined}
    >
      {!isCard && (
        <svg
          width="28"
          height="28"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className="text-primary"
        >
          {icon === "inbox" && (
            <>
              <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
              <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
            </>
          )}
          {icon === "form" && (
            <>
              <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 2-2V7z" />
              <path d="M14 2v4a2 2 0 0 0 2 2h4" />
              <path d="M10 9H8" />
              <path d="M16 13H8" />
              <path d="M16 17H8" />
            </>
          )}
          {icon === "calendar" && (
            <>
              <rect width="18" height="18" x="3" y="4" rx="2" />
              <path d="M16 2v4" />
              <path d="M8 2v4" />
              <path d="M3 10h18" />
            </>
          )}
          {icon === "user" && (
            <>
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </>
          )}
        </svg>
      )}
      <p className={titleClass}>{title}</p>
      {hint && <p className={hintClass}>{hint}</p>}
      {action}
    </div>
  );
}
