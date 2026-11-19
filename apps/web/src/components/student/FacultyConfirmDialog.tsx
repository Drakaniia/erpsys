import { useEffect, useState } from "react";
import AppleCheckbox from "../ui/AppleCheckbox";

export default function FacultyConfirmDialog({
  open,
  busy,
  onconfirm,
  onclose,
}: {
  open: boolean;
  busy: boolean;
  onconfirm: () => void;
  onclose: () => void;
}) {
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (open) setChecked(false);
  }, [open]);

  if (!open) return null;

  function handleConfirm() {
    if (!checked || busy) return;
    onconfirm();
    setChecked(false);
  }

  return (
    <div
      className="modal-scrim fixed inset-0 z-50 flex items-center justify-center p-4"
      tabIndex={-1}
      style={{ background: "rgba(0, 0, 0, 0.08)" }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="faculty-confirm-title"
      aria-describedby="faculty-confirm-body"
      onClick={onclose}
      onKeyDown={(e) => {
        if (e.key === "Escape") onclose();
      }}
    >
      <div
        className="w-full max-w-sm rounded-2xl bg-surface-raised p-5 shadow-xl"
        role="presentation"
        onClick={(e) => e.stopPropagation()}
      >
        <h2
          id="faculty-confirm-title"
          className="text-base font-semibold text-ink"
        >
          Confirm you&apos;re at the faculty
        </h2>
        <p id="faculty-confirm-body" className="mt-1 text-sm text-muted">
          Final enrollment happens face-to-face on the 3rd floor. Please confirm
          you are already at the faculty before entering the queue.
        </p>
        <label
          className={`mt-4 flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors ${checked ? "border-primary/30 bg-primary/5" : "border-border bg-surface hover:border-primary/20"}`}
        >
          <AppleCheckbox
            checked={checked}
            label="I confirm I am on the 3rd floor faculty"
            onChange={setChecked}
          />
          <span className="flex-1 text-sm font-medium text-ink">
            I am on the 3rd floor faculty
          </span>
        </label>
        <p className="mt-2 text-xs text-muted">
          You must check this to join — an adviser will serve you in person.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onclose}
            disabled={busy}
            className="rounded-lg px-3 py-1.5 text-sm text-muted transition-[transform,background-color] duration-100 ease-out hover:text-ink active:scale-[0.97] disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!checked || busy}
            className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          >
            {busy ? "Joining…" : "Confirm & Join"}
          </button>
        </div>
      </div>
    </div>
  );
}
