import type { HTMLAttributes, ReactNode } from "react";

export default function MessageGroup({
  spacing = "compact",
  className = "",
  children,
  ...rest
}: {
  spacing?: "compact" | "default";
  className?: string;
  children?: ReactNode;
} & HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...rest}
      role="group"
      className={`flex w-full flex-col ${
        spacing === "compact" ? "gap-1" : "gap-3"
      } ${className}`}
    >
      {children}
    </div>
  );
}
