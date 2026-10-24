import { useCallback, useEffect, useRef, useState } from "react";

export interface SpringOptions {
  stiffness?: number;
  damping?: number;
  precision?: number;
}

/**
 * React port of `svelte/motion`'s spring — same integrator, same defaults and
 * the same `{ stiffness, damping }` numbers from `$lib/motion`'s `UI_SPRING`,
 * so the travel matches the Svelte original. `set(target, true)` is Svelte's
 * `{ hard: true }`: jump straight there with no travel.
 */
export function useSpring(initial: number, opts: SpringOptions = {}) {
  const stiffness = opts.stiffness ?? 0.15;
  const damping = opts.damping ?? 0.8;
  const precision = opts.precision ?? 0.01;

  const [value, setValue] = useState(initial);
  const ref = useRef({
    current: initial,
    target: initial,
    last: initial,
    lastTime: 0,
    raf: 0,
    running: false,
  });

  const stop = useCallback(() => {
    const s = ref.current;
    if (s.raf) cancelAnimationFrame(s.raf);
    s.raf = 0;
    s.running = false;
  }, []);

  const set = useCallback(
    (target: number, hard = false) => {
      const s = ref.current;
      s.target = target;
      if (hard) {
        stop();
        s.last = s.current = target;
        setValue(target);
        return;
      }
      if (s.running) return;
      s.running = true;
      s.lastTime = performance.now();
      const tick = (now: number) => {
        // Same clamp as Svelte: a blocked thread must not fling the spring.
        const elapsed = Math.min(now - s.lastTime, 1000 / 30);
        const dt = (elapsed * 60) / 1000;
        const delta = s.target - s.current;
        const velocity = (s.current - s.last) / (dt || 1 / 60);
        const acceleration = stiffness * delta - damping * velocity;
        const d = (velocity + acceleration) * dt;
        s.lastTime = now;
        s.last = s.current;
        if (Math.abs(d) < precision && Math.abs(delta) < precision) {
          s.last = s.current = s.target;
          setValue(s.target);
          s.running = false;
          s.raf = 0;
          return;
        }
        s.current += d;
        setValue(s.current);
        s.raf = requestAnimationFrame(tick);
      };
      s.raf = requestAnimationFrame(tick);
    },
    [stiffness, damping, precision, stop],
  );

  useEffect(() => stop, [stop]);

  return [value, set] as const;
}
