import { useCallback, useEffect, useRef, useState } from "react";
import { trapTabKey } from "$lib/officer/detail-handlers";
import { usePreviewSrc } from "$lib/storage/use-preview-src";
import { isPdfItem } from "$lib/storage/preview";
import FileChip from "../FileChip";

type LightboxItem = {
  id: string;
  fileUrl: string;
  fileKey?: string | null;
  mime?: string | null;
  name?: string | null;
};

function ZoomableImage({
  item,
  index,
  count,
  zoom,
  tx,
  ty,
  onClose,
  onResetZoom,
}: {
  item: LightboxItem;
  index: number;
  count: number;
  zoom: number;
  tx: number;
  ty: number;
  onClose: () => void;
  onResetZoom: () => void;
}) {
  const src = usePreviewSrc(item);
  if (isPdfItem(item))
    return (
      <div className="w-full max-w-sm">
        <FileChip name={item.name ?? "Document.pdf"} href={src} />
      </div>
    );
  if (!src) return null;
  return (
    <img
      key={item.id}
      src={src}
      alt={`Evidence image ${index + 1} of ${count} — click to return to sheet`}
      className="max-h-[86vh] max-w-[92vw] cursor-zoom-out select-none object-contain shadow-2xl"
      draggable={false}
      style={{
        transform: `scale(${zoom}) translate(${tx}px, ${ty}px)`,
        willChange: "transform, opacity",
      }}
      onClick={(e) => {
        e.stopPropagation();
        if (zoom === 1) onClose();
        else onResetZoom();
      }}
      title={
        zoom === 1 ? "Click to return to sheet" : "Click to reset zoom (1×)"
      }
    />
  );
}

// ponytail: svelte 150ms fade transitions dropped — the settled DOM is
// identical. Add when motion polish is scheduled for this surface.
export default function EvidenceLightbox({
  images,
  index,
  onclose,
  onindexchange,
}: {
  images: LightboxItem[];
  index: number;
  onclose: () => void;
  onindexchange: (i: number) => void;
}) {
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef({ dist: 1, zoom: 1 });
  const zoomRef = useRef(1);

  const [zoom, setZoomState] = useState(1);
  const [tx, setTx] = useState(0);
  const [ty, setTy] = useState(0);
  const [panning, setPanning] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const last = useRef({ x: 0, y: 0 });

  const handleClose = useCallback(() => {
    if (isClosing) return;
    setIsClosing(true);
    setTimeout(onclose, 200);
  }, [isClosing, onclose]);

  const count = images.length;
  const current = index >= 0 && index < images.length ? images[index] : null;

  const setZoom = useCallback((next: number) => {
    const clamped = Math.min(4, Math.max(1, next));
    zoomRef.current = clamped;
    setZoomState(clamped);
    if (clamped === 1) {
      setTx(0);
      setTy(0);
    }
  }, []);

  const goTo = useCallback(
    (next: number) => {
      if (next < 0 || next >= count || next === index) return;
      setZoom(1);
      onindexchange(next);
    },
    [count, index, onindexchange, setZoom],
  );

  useEffect(() => {
    setZoom(1);
  }, [index, setZoom]);

  useEffect(() => {
    const el = overlayRef.current;
    if (!el || !current) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      setZoom(zoomRef.current + (e.deltaY < 0 ? 0.15 : -0.15));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [current, setZoom]);

  useEffect(() => {
    const el = overlayRef.current;
    if (!el || !current) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKeydown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        handleClose();
        return;
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        goTo(index - 1);
        return;
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        goTo(index + 1);
        return;
      }
      if (e.key === "Tab") trapTabKey(e, el);
    };
    document.addEventListener("keydown", onKeydown, true);
    return () => {
      document.removeEventListener("keydown", onKeydown, true);
      previouslyFocused?.focus?.();
    };
  }, [current, index, goTo, onclose]);

  function onPointerDown(e: React.PointerEvent) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 1) {
      setPanning(true);
      last.current = { x: e.clientX, y: e.clientY };
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    } else if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = {
        dist: Math.hypot(a.x - b.x, a.y - b.y) || 1,
        zoom: zoomRef.current,
      };
      setPanning(false);
    }
  }

  function onPointerMove(e: React.PointerEvent) {
    const map = pointers.current;
    if (map.size === 0 || !map.has(e.pointerId)) return;
    map.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (map.size === 2) {
      const [a, b] = [...map.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      setZoom((pinch.current.zoom * dist) / pinch.current.dist);
    } else if (panning && zoomRef.current > 1) {
      setTx((v) => v + e.clientX - last.current.x);
      setTy((v) => v + e.clientY - last.current.y);
      last.current = { x: e.clientX, y: e.clientY };
    }
  }

  function onPointerUp(e: React.PointerEvent) {
    pointers.current.delete(e.pointerId);
    setPanning(pointers.current.size === 1);
  }

  if (!current) return null;
  return (
    <div
      ref={overlayRef}
      role="dialog"
      aria-modal="true"
      aria-label="Evidence lightbox — click image or backdrop to return to sheet, Esc to close"
      tabIndex={-1}
      className={`modal-scrim fixed inset-0 z-[60] flex flex-col ${isClosing ? "lightbox-exit" : "lightbox-enter"}`}
      style={{ background: "rgba(0, 0, 0, 0.08)" }}
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
    >
      <div className="flex items-center justify-between px-4 py-3">
        <p className="text-sm text-white/90 tabular-nums">
          {index + 1} / {count}
        </p>
        <button
          ref={closeRef}
          type="button"
          aria-label="Close lightbox"
          className="rounded-lg p-2 text-white/90 transition-[transform,background-color] duration-100 ease-out hover:bg-white/10 hover:text-white active:scale-[0.97]"
          onClick={handleClose}
        >
          <svg
            width="18"
            height="18"
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
      <div
        className="relative flex flex-1 touch-none items-center justify-center overflow-hidden p-4"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onClick={(e) => {
          if (e.target === e.currentTarget) onclose();
        }}
      >
        <div
          className="max-h-full max-w-full"
          style={{ transformOrigin: "center center" }}
        >
          <ZoomableImage
            item={current}
            index={index}
            count={count}
            zoom={zoom}
            tx={tx}
            ty={ty}
            onClose={handleClose}
            onResetZoom={() => setZoom(1)}
          />
        </div>
      </div>
      <div className="flex items-center justify-center gap-3 px-4 py-3">
        <button
          type="button"
          aria-label="Previous image"
          className="rounded-lg p-2 text-white/90 transition-[transform,background-color] duration-100 ease-out hover:bg-white/10 hover:text-white active:scale-[0.97] disabled:opacity-30"
          onClick={() => goTo(index - 1)}
          disabled={index <= 0}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            aria-hidden="true"
          >
            <path d="m15 18-6-6 6-6" />
          </svg>
        </button>
        <button
          type="button"
          aria-label="Next image"
          className="rounded-lg p-2 text-white/90 transition-[transform,background-color] duration-100 ease-out hover:bg-white/10 hover:text-white active:scale-[0.97] disabled:opacity-30"
          onClick={() => goTo(index + 1)}
          disabled={index >= count - 1}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            aria-hidden="true"
          >
            <path d="m9 18 6-6-6-6" />
          </svg>
        </button>
      </div>
    </div>
  );
}
