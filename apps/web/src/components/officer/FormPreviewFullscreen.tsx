import { useEffect, useRef } from "react";
import { dialogTrap } from "$lib/ui/dialog-trap";

export function embeddedFormUrl(responderUri: string): string {
  try {
    const url = new URL(responderUri);
    url.searchParams.set("embedded", "true");
    return url.toString();
  } catch {
    return responderUri;
  }
}

export default function FormPreviewFullscreen({
  open,
  title,
  src,
  reloadKey,
  onedit,
  onclose,
}: {
  open: boolean;
  title: string;
  src: string;
  reloadKey: number;
  onedit: () => void;
  onclose: () => void;
}) {
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open || !panelRef.current) return;
    const trap = dialogTrap(panelRef.current, { onEscape: onclose });
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      trap.destroy();
      document.body.style.overflow = overflow;
    };
  }, [open, onclose]);

  if (!open) return null;

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="form-preview-title"
      tabIndex={-1}
      className="fixed inset-0 z-[60] flex flex-col bg-surface"
    >
      <div className="flex items-center gap-3 border-b border-border px-4 py-2.5">
        <p
          id="form-preview-title"
          className="min-w-0 flex-1 truncate text-[15px] font-semibold text-ink"
        >
          {title}
        </p>
        <button
          type="button"
          onClick={onedit}
          className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-primary/90"
        >
          Edit questions
        </button>
        <button
          type="button"
          aria-label="Exit full screen"
          onClick={onclose}
          data-modal-initial-focus
          className="flex h-8 w-8 items-center justify-center rounded-full text-muted transition-[transform,background-color,color] duration-100 ease-out hover:bg-ink/[0.06] hover:text-ink active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            aria-hidden="true"
          >
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      </div>
      <iframe
        key={reloadKey}
        src={src}
        title={`${title} — full screen preview`}
        className="w-full flex-1 border-0 bg-white"
      />
    </div>
  );
}
