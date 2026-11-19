import type { HTMLAttributes, ReactNode } from "react";

export default function MessageContent({
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
      className={`flex min-w-0 max-w-[82%] flex-col gap-1 ${className}`}
    >
      {children}
    </div>
  );
}
