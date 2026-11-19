import type { HTMLAttributes, ReactNode } from "react";

export default function MessageFooter({
  className = "",
  children,
  ...rest
}: {
  className?: string;
  children?: ReactNode;
} & HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...rest}
      className={`flex items-center gap-2 px-1 text-[11px] leading-4 text-muted ${className}`}
    >
      {children}
    </div>
  );
}
