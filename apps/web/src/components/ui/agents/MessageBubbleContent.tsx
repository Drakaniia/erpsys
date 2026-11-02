import type { HTMLAttributes, ReactNode } from "react";

export default function MessageBubbleContent({
  render,
  className = "",
  children,
  ...rest
}: {
  render?: ReactNode;
  className?: string;
  children?: ReactNode;
} & HTMLAttributes<HTMLDivElement>) {
  return (
    <div {...rest} className={`min-w-0 break-words ${className}`}>
      {render ?? children}
    </div>
  );
}
