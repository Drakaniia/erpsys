import { useEffect, useId, useRef, useState } from "react";
import { prefersReducedMotion, UI_SPRING } from "$lib/motion";
import { useSpring } from "$lib/ui/use-spring";
import "./AppleSwitch.css";

type SwitchSize = "sm" | "md";
type LabelPosition = "start" | "end";

export default function AppleSwitch({
  checked,
  onchange,
  label,
  description,
  labelPosition = "start",
  size = "md",
  disabled = false,
  busy = false,
  interactive = true,
  ariaLabel,
}: {
  /** Current on/off state. */
  checked: boolean;
  onchange?: (next: boolean) => void;
  label?: string;
  description?: string;
  labelPosition?: LabelPosition;
  size?: SwitchSize;
  disabled?: boolean;
  busy?: boolean;
  interactive?: boolean;
  ariaLabel?: string;
}) {
  const hintId = `apple-switch-hint-${useId()}`;
  const blocked = disabled || busy;

  const [on, setOn] = useSpring(checked ? 1 : 0, UI_SPRING);
  const [reduced, setReduced] = useState(false);
  const initialized = useRef(false);

  useEffect(() => setReduced(prefersReducedMotion()), []);

  useEffect(() => {
    const target = checked ? 1 : 0;
    if (!initialized.current) {
      initialized.current = true;
      setOn(target, true);
      return;
    }
    if (reduced) setOn(target, true);
    else setOn(target);
  }, [checked, reduced, setOn]);

  const metrics =
    size === "md"
      ? { track: "h-7 w-12", knob: "h-6 w-6", travel: 20 }
      : { track: "h-6 w-10", knob: "h-5 w-5", travel: 16 };
  const knobX = on * metrics.travel;

  function handleClick() {
    if (blocked) return;
    onchange?.(!checked);
  }

  const text = (
    <span className="text-sm font-medium tracking-[-0.01em] text-ink">
      {label}
    </span>
  );

  const visualTrack = (
    <span
      className={`switch-track relative flex shrink-0 items-center rounded-full p-[2px] ${metrics.track}`}
      style={{
        background: "rgba(28, 28, 26, 0.20)",
        boxShadow:
          "inset 0 1px 2px rgba(28, 28, 26, 0.10), inset 0 0 0 0.5px rgba(28, 28, 26, 0.06)",
      }}
      aria-hidden="true"
    >
      <span
        className="pointer-events-none absolute inset-0 rounded-full bg-primary"
        style={{ opacity: on }}
      />
      <span
        className="relative will-change-transform"
        style={{ transform: `translateX(${knobX}px)` }}
      >
        <span
          className={`knob-press block rounded-full bg-white ${metrics.knob}${
            reduced
              ? ""
              : " transition-transform duration-150 ease-out group-active:scale-[1.06]"
          }`}
          style={{
            boxShadow:
              "0 0.5px 1px rgba(0, 0, 0, 0.18), 0 2px 6px rgba(0, 0, 0, 0.12)",
          }}
        />
      </span>
    </span>
  );

  const content = (
    <>
      {label && labelPosition === "start" && text}
      {visualTrack}
      {label && labelPosition === "end" && text}
    </>
  );

  return (
    <span className="apple-switch inline-flex items-center">
      {interactive ? (
        <button
          type="button"
          role="switch"
          aria-checked={checked}
          aria-label={label ? undefined : ariaLabel}
          aria-describedby={description ? hintId : undefined}
          aria-busy={busy ? "true" : undefined}
          disabled={blocked}
          onClick={handleClick}
          className="group inline-flex min-h-11 cursor-pointer items-center gap-2.5 rounded-full py-1 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {content}
        </button>
      ) : (
        <span className="inline-flex items-center gap-2.5" aria-hidden="true">
          {content}
        </span>
      )}
      {description && (
        <span id={hintId} className="sr-only">
          {description}
        </span>
      )}
    </span>
  );
}
