import { useState } from "react";
import { STUDENT_NUMBER_PATTERN } from "$lib/domain/constants";

export default function StudentNumberPrompt({
  saving,
  error,
  onsave,
  ondismiss,
}: {
  saving: boolean;
  error: string | null;
  onsave: (value: string) => void;
  ondismiss: () => void;
}) {
  const [value, setValue] = useState("");
  const [touched, setTouched] = useState(false);

  const invalid = touched && !STUDENT_NUMBER_PATTERN.test(value.trim());

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (!STUDENT_NUMBER_PATTERN.test(value.trim())) return;
    const v = value.trim();
    if (!v) return;
    onsave(v);
  }

  return (
    <div className="rounded-2xl border border-border bg-surface-raised p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[15px] font-semibold text-ink">
            Enter your student number
          </p>
          <p className="mt-0.5 text-xs text-muted">
            We couldn&apos;t derive it from your account.
          </p>
        </div>
        <button
          type="button"
          onClick={ondismiss}
          aria-label="Dismiss"
          className="rounded-full p-1.5 text-muted hover:bg-surface hover:text-ink"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M18 6 6 18" />
            <path d="m6 6 12 12" />
          </svg>
        </button>
      </div>

      <form className="mt-3 flex gap-2" onSubmit={submit}>
        <div className="min-w-0 flex-1">
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            type="text"
            inputMode="numeric"
            maxLength={64}
            autoComplete="off"
            placeholder="e.g. 2401117979"
            aria-label="Student number"
            aria-invalid={invalid || Boolean(error)}
            aria-describedby={
              invalid || error ? "student-number-error" : undefined
            }
            className="h-12 w-full rounded-xl border border-border bg-surface px-3 text-[15px] tabular-nums text-ink outline-none placeholder:text-muted/60 focus:border-primary focus:ring-2 focus:ring-primary/25"
          />
          {error || invalid ? (
            <p
              id="student-number-error"
              className="mt-1.5 text-xs text-error"
              aria-live="polite"
            >
              {error ?? (invalid ? "Only numbers are allowed." : null)}
            </p>
          ) : null}
        </div>
        <button
          type="submit"
          disabled={saving || invalid}
          className="flex h-12 shrink-0 items-center justify-center rounded-xl bg-primary px-4 text-[15px] font-semibold text-white disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </form>
    </div>
  );
}
