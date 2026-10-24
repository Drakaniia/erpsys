import { useEffect, useState, type HTMLAttributes } from "react";
import "./AgentProgress.css";

export default function AgentProgress({
  label = "Working",
  elapsedSeconds,
  initialSeconds = 0,
  running = true,
  className = "",
  ...rest
}: {
  label?: string;
  elapsedSeconds?: number;
  initialSeconds?: number;
  running?: boolean;
  className?: string;
} & HTMLAttributes<HTMLDivElement>) {
  const [internal, setInternal] = useState(initialSeconds);
  const elapsed = elapsedSeconds ?? internal;

  useEffect(() => {
    if (elapsedSeconds !== undefined || !running) return;
    const id = window.setInterval(() => setInternal((v) => v + 0.1), 100);
    return () => window.clearInterval(id);
  }, [elapsedSeconds, running]);

  const total = Math.floor(elapsed);
  const s = total % 60;
  const m = Math.floor(total / 60) % 60;
  const h = Math.floor(total / 3600);
  const pad = (n: number) => String(n).padStart(2, "0");
  const formatted = h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;

  return (
    <div
      {...rest}
      role="status"
      aria-live="polite"
      className={`flex items-center gap-2 text-sm text-muted ${className}`}
    >
      <span className="flex gap-0.5" aria-hidden="true">
        {[0, 140, 280, 420].map((delay) => (
          <span
            key={delay}
            className="agent-progress-bar"
            style={{ animationDelay: `${delay}ms` }}
          />
        ))}
      </span>
      <span>{label}</span>
      <span className="tabular-nums text-muted/70">{formatted}</span>
    </div>
  );
}
