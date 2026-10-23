import type { HTMLAttributes } from "react";
import "./MessageTyping.css";

export default function MessageTyping({
  label = "Responding",
  className = "",
  ...rest
}: { label?: string; className?: string } & HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...rest}
      role="status"
      aria-live="polite"
      className={`flex items-center gap-1.5 text-sm text-muted ${className}`}
    >
      <span className="flex items-center gap-1" aria-hidden="true">
        {[0, 160, 320].map((delay) => (
          <span
            key={delay}
            className="agent-typing-dot"
            style={{ animationDelay: `${delay}ms` }}
          />
        ))}
      </span>
      <span className="sr-only">{label}</span>
    </div>
  );
}
