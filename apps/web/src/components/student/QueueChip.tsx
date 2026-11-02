import { useEffect, useRef } from "react";
import { prefersReducedMotion, UI_SPRING } from "$lib/motion";
import { useSpring } from "$lib/ui/use-spring";

export default function QueueChip({
  position,
  onclick,
}: {
  position: number | null;
  onclick: () => void;
}) {
  const [scale, setScale] = useSpring(1, UI_SPRING);
  const prev = useRef("");
  useEffect(() => {
    const key = position?.toString() ?? "null";
    if (prev.current === "") {
      prev.current = key;
      return;
    }
    if (prev.current === key) return;
    prev.current = key;
    if (prefersReducedMotion()) return;
    setScale(0.8);
    const raf = requestAnimationFrame(() => setScale(1));
    return () => cancelAnimationFrame(raf);
  }, [position, setScale]);

  return (
    <button
      type="button"
      onClick={onclick}
      aria-label={
        position != null ? `Queue position ${position}` : "Checking your place"
      }
      className="flex items-center gap-1 rounded-full border border-primary/20 bg-primary/10 px-2.5 py-0.5 text-[13px] font-semibold tabular-nums text-primary transition-colors duration-150 ease-out hover:bg-primary/15"
      style={{ transform: `scale(${scale})` }}
    >
      <svg
        width="13"
        height="13"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
      {position != null ? `#${position}` : "checking…"}
    </button>
  );
}
