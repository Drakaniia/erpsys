import { useEffect, useRef } from "react";
import { prefersReducedMotion, UI_SPRING } from "$lib/motion";
import { useSpring } from "$lib/ui/use-spring";

export default function RoleChip({ role }: { role: string }) {
  const prev = useRef<string | null>(null);
  const [t, setT] = useSpring(1, UI_SPRING);
  useEffect(() => {
    if (prev.current === null) {
      prev.current = role;
      return;
    }
    if (role === prev.current) return;
    prev.current = role;
    if (prefersReducedMotion()) return;
    setT(0.8);
    const raf = requestAnimationFrame(() => setT(1));
    return () => cancelAnimationFrame(raf);
  }, [role, setT]);

  const isInstructor = role === "ENROLLMENT_ADVISER";
  const chipClass =
    role === "SBO_OFFICER"
      ? "bg-primary text-white"
      : role === "ENROLLMENT_ADVISER"
        ? "border border-primary/40 text-primary"
        : role === "ADMIN"
          ? "bg-ink text-white"
          : "bg-border/40 text-muted";

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${chipClass}`}
      style={{ transform: `scale(${t})` }}
      title={isInstructor ? "Derived from email domain" : undefined}
    >
      {role === "ENROLLMENT_ADVISER"
        ? "Instructor (auto)"
        : role.replaceAll("_", " ")}
    </span>
  );
}
