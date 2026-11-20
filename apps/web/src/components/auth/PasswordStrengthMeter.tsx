import { PASSWORD_REQUIREMENTS } from "$lib/auth/password";
import {
  assessPasswordStrength,
  passwordSchemaError,
  type PasswordStrength,
} from "$lib/auth/password-strength";

const SEGMENT_COLOR_CLASSES = [
  "bg-error",
  "bg-error",
  "bg-warning",
  "bg-primary",
];

const SEGMENT_ARIA = [
  "Too weak — not acceptable",
  "Weak — acceptable but easy to guess",
  "Good — acceptable",
  "Strong — acceptable",
];

function measure(value: string): {
  strength: PasswordStrength;
  error: string | null;
} {
  return {
    strength: assessPasswordStrength(value),
    error: passwordSchemaError(value),
  };
}

/**
 * Reusable password strength meter for the password-setting surfaces (student
 * registration, password reset, admin reset). Renders nothing for an empty
 * value, so untouched forms stay clean. The meter's verdict always matches the
 * shared `newPasswordSchema`: an unacceptable password renders a full red bar
 * with the schema's error message and the rules still to meet, so "acceptable"
 * here means exactly what account creation will accept.
 */
export default function PasswordStrengthMeter({
  value,
  rulesId = "password-strength-rules",
  describedBy,
}: {
  value: string;
  /** Id of the rules list rendered inside the meter when `describedBy` is unset. */
  rulesId?: string;
  /** Id of rules text rendered by the caller; suppresses the meter's own list. */
  describedBy?: string;
}) {
  if (value.length === 0) return null;

  const { strength, error } = measure(value);
  const filled = strength.score + 1;
  const unmet = strength.unmet;

  const segments = (
    <div className="flex gap-1.5" aria-hidden="true">
      {[0, 1, 2, 3].map((i) => (
        <div
          key={i}
          className={`h-1.5 flex-1 rounded-full transition-colors duration-200 ${
            i < filled ? SEGMENT_COLOR_CLASSES[strength.score] : "bg-border"
          }`}
        />
      ))}
    </div>
  );

  const bulletList = (
    <ul id={rulesId} className="space-y-1 text-xs">
      {unmet.map((requirement) => (
        <li key={requirement} className="flex items-center gap-1.5 text-error">
          <span aria-hidden="true">•</span> {requirement}
        </li>
      ))}
    </ul>
  );

  if (!strength.acceptable) {
    return (
      <div className="mt-2 space-y-1.5" role="status" aria-live="polite">
        {segments}
        <p className="text-xs font-medium text-error">
          Not acceptable yet — {error ?? PASSWORD_REQUIREMENTS}
        </p>
        {unmet.length > 0 ? bulletList : null}
      </div>
    );
  }

  return (
    <div
      className="mt-2 space-y-1.5"
      role="status"
      aria-live="polite"
      aria-describedby={describedBy ?? rulesId}
    >
      {segments}
      <p className="text-xs text-muted">
        Password strength:{" "}
        <span className="font-medium text-ink">{strength.label}</span>
        {" — "}
        {SEGMENT_ARIA[filled - 1]}
      </p>
      {describedBy ? null : bulletList}
    </div>
  );
}
