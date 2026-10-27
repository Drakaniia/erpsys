import type { CSSProperties, ReactNode } from "react";

export function Panel({
  title,
  description,
  aside,
  index = 0,
  className = "",
  children,
}: {
  title: string;
  description?: ReactNode;
  aside?: ReactNode;
  index?: number;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      className={`oo-rise flex w-full min-w-0 flex-col rounded-2xl border border-border bg-surface-raised ${className}`}
      style={{ "--oo-i": index } as CSSProperties}
    >
      <header className="flex items-start justify-between gap-4 px-5 pt-5">
        <div className="min-w-0">
          <h2 className="text-[0.9375rem] font-semibold tracking-tight text-ink">
            {title}
          </h2>
          {description && (
            <p className="mt-1 max-w-prose text-pretty text-xs leading-relaxed text-muted">
              {description}
            </p>
          )}
        </div>
        {aside}
      </header>
      <div className="flex min-h-0 flex-1 flex-col px-5 pb-5 pt-4">
        {children}
      </div>
    </section>
  );
}

export function PanelQuiet({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-1 items-center rounded-xl border border-dashed border-border px-4 py-8">
      <p className="max-w-sm text-pretty text-sm text-muted">{children}</p>
    </div>
  );
}

export function Key({
  color,
  label,
  value,
}: {
  color: string;
  label: string;
  value?: number;
}) {
  return (
    <span className="flex items-center gap-1.5 text-xs text-muted">
      <span
        aria-hidden="true"
        className="size-2 rounded-[3px]"
        style={{ backgroundColor: color }}
      />
      {label}
      {value !== undefined && (
        <span className="font-semibold tabular-nums text-ink">
          {value.toLocaleString()}
        </span>
      )}
    </span>
  );
}
