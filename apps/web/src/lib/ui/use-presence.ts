import { useEffect, useState, type CSSProperties } from "react";
import { useReducedMotion } from "$lib/ui/use-reduced-motion";

/** Svelte's easing names, as CSS timing functions. */
const EASING = {
  quintOut: "cubic-bezier(0.22, 1, 0.36, 1)",
  cubicOut: "cubic-bezier(0.33, 1, 0.68, 1)",
} as const;

export interface PresenceOptions {
  /** Enter travel, Svelte `fly`'s `y`. */
  y?: number;
  /** Enter start scale, Svelte `scale`'s `start`. */
  scale?: number;
  /** Enter start opacity, when a `fade` is wanted. */
  fade?: boolean;
  duration?: number;
  outDuration?: number;
  easing?: keyof typeof EASING;
}

/**
 * React stand-in for `transition:fly/scale/fade` — keeps the node mounted
 * through the exit animation, which is what `out:` bought us in Svelte.
 * Reduced motion means no travel and no exit delay.
 */
export function usePresence(open: boolean, opts: PresenceOptions = {}) {
  const {
    y = 0,
    scale = 1,
    fade = false,
    duration = 200,
    outDuration = 160,
    easing = "quintOut",
  } = opts;
  const reduced = useReducedMotion();
  const active = !reduced;

  const [mounted, setMounted] = useState(open);
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    if (open) {
      setMounted(true);
      const raf = requestAnimationFrame(() => setEntered(true));
      return () => cancelAnimationFrame(raf);
    }
    setEntered(false);
    if (!active) {
      setMounted(false);
      return;
    }
    const timer = window.setTimeout(() => setMounted(false), outDuration);
    return () => window.clearTimeout(timer);
  }, [open, active, outDuration]);

  const travel = y !== 0 || scale !== 1;
  const style: CSSProperties = !active
    ? {}
    : {
        ...(fade ? { opacity: entered ? 1 : 0 } : {}),
        ...(travel
          ? {
              transform: entered
                ? "none"
                : `translateY(${y}px) scale(${scale})`,
            }
          : {}),
        transition: `${fade ? `opacity ${entered ? duration : outDuration}ms` : ""}${
          fade && travel ? ", " : ""
        }${
          travel ? `transform ${entered ? duration : outDuration}ms` : ""
        } ${EASING[easing]}`,
      };

  return { mounted, entered, active, style };
}
