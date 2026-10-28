import { useEffect, useState } from "react";

// ponytail: svelte spring enter-animation dropped — settled DOM identical.
export default function ReplyComposer({
  open,
  chips,
  busy,
  onsend,
  oncancel,
}: {
  open: boolean;
  chips: string[];
  busy: boolean;
  onsend: (chips: string[], note: string) => void;
  oncancel: () => void;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [note, setNote] = useState("");

  useEffect(() => {
    if (open) {
      setSelected([]);
      setNote("");
    }
  }, [open]);

  function toggle(chip: string) {
    setSelected((prev) =>
      prev.includes(chip) ? prev.filter((c) => c !== chip) : [...prev, chip],
    );
  }

  const canSend = selected.length > 0 || note.trim().length > 0;

  if (!open) return null;
  return (
    <div className="rounded-xl border border-border bg-surface p-3">
      <h3 className="text-sm font-semibold tracking-tight">Reply to student</h3>
      <p className="mt-0.5 text-xs text-muted">
        Select what needs to change (optional note below).
      </p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {chips.map((chip) => {
          const active = selected.includes(chip);
          return (
            <button
              key={chip}
              type="button"
              aria-pressed={active}
              className={`rounded-full border px-3 py-1 text-xs font-medium ${
                active
                  ? "border-primary bg-primary text-white"
                  : "border-border text-muted hover:text-ink"
              }`}
              onClick={() => toggle(chip)}
            >
              {chip}
            </button>
          );
        })}
      </div>
      <label className="sr-only" htmlFor="reply-note">
        Note (optional)
      </label>
      <textarea
        id="reply-note"
        value={note}
        onChange={(e) => setNote(e.currentTarget.value)}
        rows={3}
        maxLength={500}
        placeholder="Note (optional)"
        className="mt-2 w-full resize-y rounded-lg border border-border bg-surface-raised p-2 text-sm text-ink placeholder:text-muted focus:outline-none"
      />
      <div className="mt-2 flex justify-end gap-2">
        <button
          type="button"
          className="rounded-lg px-3 py-1.5 text-sm text-muted transition-[transform,background-color] duration-100 ease-out hover:bg-surface-raised hover:text-ink active:scale-[0.97] disabled:opacity-50"
          onClick={oncancel}
          disabled={busy}
        >
          Cancel
        </button>
        <button
          type="button"
          className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-white transition-[transform,background-color] duration-100 ease-out active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50"
          onClick={() => onsend(selected, note.trim())}
          disabled={busy || !canSend}
        >
          {busy ? "Sending…" : "Send"}
        </button>
      </div>
    </div>
  );
}
