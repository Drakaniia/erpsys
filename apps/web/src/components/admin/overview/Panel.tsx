import type { CSSProperties, ReactNode } from "react";

export function Panel({
  title,
  description,
  action,
  index = 0,
  className = "",
  children,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  index?: number;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      className={`ov-rise flex w-full min-w-0 flex-col rounded-xl border border-border bg-surface-raised ${className}`}
      style={{ "--ov-i": index } as CSSProperties}
    >
      <header className="flex items-start justify-between gap-4 px-5 pt-4">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold tracking-tight text-ink">
            {title}
          </h2>
          {description && (
            <p className="mt-0.5 text-xs text-muted">{description}</p>
          )}
        </div>
        {action}
      </header>
      <div className="flex min-h-0 flex-1 flex-col px-5 pb-5 pt-3">
        {children}
      </div>
    </section>
  );
}

export function PanelLink({
  onClick,
  children,
}: {
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="ov-link -mr-2 -mt-1 shrink-0 rounded-md px-2 py-1 text-xs font-medium text-primary hover:bg-primary/5"
    >
      {children}
    </button>
  );
}

export function PanelEmpty({
  children,
  action,
}: {
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-1 flex-col items-start justify-center gap-3 rounded-lg border border-dashed border-border px-4 py-8">
      <p className="max-w-sm text-sm text-muted">{children}</p>
      {action}
    </div>
  );
}
