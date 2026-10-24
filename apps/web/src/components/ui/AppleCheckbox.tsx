import { useEffect, useState } from "react";
import { prefersReducedMotion, UI_SPRING } from "$lib/motion";
import { useSpring } from "$lib/ui/use-spring";
import "./AppleCheckbox.css";

export default function AppleCheckbox({
  checked = false,
  indeterminate = false,
  disabled = false,
  label,
  onChange,
}: {
  checked: boolean;
  indeterminate?: boolean;
  disabled?: boolean;
  label: string;
  onChange?: (next: boolean) => void;
}) {
  const [check, setCheck] = useSpring(checked ? 1 : 0, UI_SPRING);
  const [bg, setBg] = useSpring(checked || indeterminate ? 1 : 0, UI_SPRING);
  const [reduced, setReduced] = useState(false);

  useEffect(() => setReduced(prefersReducedMotion()), []);

  useEffect(() => {
    const target = checked || indeterminate ? 1 : 0;
    const checkTarget = checked ? 1 : 0;
    if (reduced) {
      setCheck(checkTarget, true);
      setBg(target, true);
    } else {
      setCheck(checkTarget);
      setBg(target);
    }
  }, [checked, indeterminate, reduced, setCheck, setBg]);

  function handleClick(e: React.MouseEvent) {
    if (disabled) return;
    e.preventDefault();
    onChange?.(!checked);
  }

  function handleKeydown(e: React.KeyboardEvent) {
    if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      if (!disabled) onChange?.(!checked);
    }
  }

  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={indeterminate ? "mixed" : checked ? "true" : "false"}
      aria-label={label}
      disabled={disabled}
      tabIndex={disabled ? -1 : 0}
      onClick={handleClick}
      onKeyDown={handleKeydown}
      className="apple-checkbox group flex h-11 w-11 items-center justify-center rounded-full focus-visible:outline-none disabled:opacity-40"
    >
      <span
        className="relative flex h-5 w-5 items-center justify-center rounded-[6px] border-[1.5px] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.06)] transition-[box-shadow,border-color] duration-150 ease-out will-change-transform group-active:scale-[0.92] group-focus-visible:ring-2 group-focus-visible:ring-primary/40 group-focus-visible:ring-offset-1"
        style={{
          background: `rgba(59,130,246, ${bg})`,
          borderColor: `rgba(${bg > 0.5 ? "59,130,246" : "229,231,235"}, ${0.8 + 0.2 * bg})`,
          willChange: "transform, opacity",
        }}
      >
        <span
          className="pointer-events-none absolute inset-0 rounded-[5px]"
          style={{
            background:
              "linear-gradient(to bottom, rgba(255,255,255,0.22), transparent)",
            opacity: bg,
          }}
          aria-hidden="true"
        />

        {!indeterminate ? (
          <svg
            width="12"
            height="12"
            viewBox="0 0 12 12"
            fill="none"
            aria-hidden="true"
            className="pointer-events-none"
            style={{
              opacity: check,
              ...(reduced
                ? {}
                : {
                    transform: `scale(${0.7 + 0.3 * check}) rotate(${-8 + 8 * check}deg)`,
                  }),
              willChange: "transform, opacity",
            }}
          >
            <path
              d="M2.5 6.2L4.8 8.5L9.5 3.2"
              stroke="white"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ filter: "drop-shadow(0 0.5px 0.5px rgba(0,0,0,0.12))" }}
            />
          </svg>
        ) : (
          <span
            className="pointer-events-none h-[1.7px] w-2.5 rounded-full bg-white"
            style={{
              opacity: indeterminate ? 1 : 0,
              transform: `scaleX(${indeterminate ? 1 : 0.4})`,
              willChange: "transform, opacity",
              boxShadow: "0 0.5px 0.5px rgba(0,0,0,0.12)",
            }}
            aria-hidden="true"
          />
        )}
      </span>
    </button>
  );
}
