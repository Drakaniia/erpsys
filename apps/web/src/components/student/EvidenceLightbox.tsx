import { useEffect, useState } from "react";
import { usePreviewSrc } from "$lib/storage/use-preview-src";
import { isPdfItem } from "$lib/storage/preview";
import FileChip from "../FileChip";

type Item = {
  id?: string;
  fileKey?: string | null;
  fileUrl: string;
  mime?: string | null;
  name?: string | null;
  kind: string;
};

function LightboxImage({ item }: { item: Item }) {
  const src = usePreviewSrc(
    item.id || item.fileKey
      ? { id: item.id ?? "", fileKey: item.fileKey, fileUrl: item.fileUrl }
      : { id: "", fileUrl: item.fileUrl },
  );
  if (isPdfItem(item))
    return (
      <div className="w-full max-w-sm">
        <FileChip name={item.name ?? "Document.pdf"} href={src} />
      </div>
    );
  if (!src) return null;
  return (
    <img
      src={src}
      alt="Uploaded evidence"
      className="max-h-[75vh] w-auto rounded-xl object-contain shadow-2xl"
    />
  );
}

export default function EvidenceLightbox({
  images,
  index,
  onclose,
}: {
  images: Item[];
  index: number;
  onclose: () => void;
}) {
  const [current, setCurrent] = useState(index);
  const [isClosing, setIsClosing] = useState(false);

  useEffect(() => setCurrent(index), [index]);

  function step(delta: number) {
    setCurrent((c) => (c + delta + images.length) % images.length);
  }

  function handleClose() {
    if (isClosing) return;
    setIsClosing(true);
    setTimeout(onclose, 200);
  }

  useEffect(() => {
    const onKeydown = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      if (e.key === "Escape") {
        e.preventDefault();
        handleClose();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        step(1);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        step(-1);
      }
    };
    window.addEventListener("keydown", onKeydown);
    return () => window.removeEventListener("keydown", onKeydown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [images.length, onclose]);

  const item = images[current];
  return (
    <div
      className={`modal-scrim lightbox fixed inset-0 z-[60] flex flex-col items-center justify-center p-4 ${isClosing ? "lightbox-exit" : "lightbox-enter"}`}
      style={{ background: "rgba(0, 0, 0, 0.08)" }}
      role="dialog"
      aria-modal="true"
      aria-label="Evidence preview"
      tabIndex={-1}
      onClick={handleClose}
      onKeyDown={(e) => {
        if (e.key === "Escape" || e.key === "Enter" || e.key === " ") {
          e.stopPropagation();
          handleClose();
        }
      }}
    >
      <div
        className="relative flex max-h-[90vh] w-full max-w-2xl flex-col items-center lg:max-w-[90vw]"
        role="presentation"
        onClick={(e) => e.stopPropagation()}
      >
        {images.length > 1 ? (
          <div className="mb-3 flex items-center gap-4">
            <button
              type="button"
              onClick={() => step(-1)}
              aria-label="Previous image"
              className="rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="m15 18-6-6 6-6" />
              </svg>
            </button>
            <p className="text-sm tabular-nums text-white/80">
              {current + 1} / {images.length}
            </p>
            <button
              type="button"
              onClick={() => step(1)}
              aria-label="Next image"
              className="rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="m9 18 6-6-6-6" />
              </svg>
            </button>
          </div>
        ) : null}
        {item ? <LightboxImage item={item} /> : null}
        <button
          type="button"
          onClick={handleClose}
          aria-label="Close preview"
          className="absolute -top-3 right-0 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
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
    </div>
  );
}
