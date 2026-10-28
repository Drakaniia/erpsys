import { useEffect, useRef, useState } from "react";

const MAX_EDGE = 1920;

export default function WebcamCapture({
  onsave,
  oncancel,
  busy,
}: {
  onsave: (dataUrl: string) => void;
  oncancel: () => void;
  busy: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(true);
  const [captured, setCaptured] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function start() {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          setError("Camera unavailable — use student upload instead");
          return;
        }
        const s = await navigator.mediaDevices.getUserMedia({
          video: { width: 1280, height: 960 },
          audio: false,
        });
        if (cancelled) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = s;
        const video = videoRef.current;
        if (video) {
          video.srcObject = s;
          await video.play().catch(() => {});
        }
      } catch {
        if (!cancelled)
          setError("Camera unavailable — use student upload instead");
      } finally {
        if (!cancelled) setStarting(false);
      }
    }
    start();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, []);

  function capture() {
    const video = videoRef.current;
    if (!video || !streamRef.current) return;
    const naturalWidth = video.videoWidth;
    const naturalHeight = video.videoHeight;
    if (!naturalWidth || !naturalHeight) return;
    const scale = Math.min(1, MAX_EDGE / Math.max(naturalWidth, naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(naturalWidth * scale);
    canvas.height = Math.round(naturalHeight * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    setCaptured(canvas.toDataURL("image/jpeg", 0.85));
    video.pause();
  }

  function retake() {
    setCaptured(null);
    videoRef.current?.play().catch(() => {});
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface">
      {error ? (
        <div className="flex items-center justify-between gap-3 p-4">
          <p className="text-sm text-muted">{error}</p>
          <button
            type="button"
            aria-label="Close camera"
            className="rounded-lg p-1.5 text-muted hover:bg-surface-raised hover:text-ink"
            onClick={oncancel}
          >
            <svg
              width="16"
              height="16"
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
      ) : (
        <>
          <div className="relative aspect-[4/3] w-full bg-ink/90">
            {captured ? (
              <img
                src={captured}
                alt="Preview of the captured frame"
                className="h-full w-full object-contain"
              />
            ) : (
              <>
                <video
                  ref={videoRef}
                  className="h-full w-full object-contain"
                  muted
                  playsInline
                  autoPlay
                  aria-label="Live camera feed"
                />
                {starting ? (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <p className="text-sm text-white/80">Starting camera…</p>
                  </div>
                ) : (
                  <span className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-ink/60 px-2.5 py-1 text-xs text-white">
                    <span className="h-1.5 w-1.5 rounded-full bg-error"></span>
                    Live
                  </span>
                )}
              </>
            )}
          </div>
          <div className="flex items-center justify-end gap-2 p-3">
            {captured ? (
              <>
                <button
                  type="button"
                  className="press rounded-lg border border-border bg-surface-raised px-3 py-1.5 text-sm text-ink transition-transform duration-100 ease-out active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50"
                  onClick={retake}
                  disabled={busy}
                >
                  Retake
                </button>
                <button
                  type="button"
                  className="press rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-white transition-transform duration-100 ease-out active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50"
                  onClick={() => captured && onsave(captured)}
                  disabled={busy}
                >
                  {busy ? "Saving…" : "Save & stamp"}
                </button>
              </>
            ) : (
              <button
                type="button"
                className="press rounded-lg bg-primary px-4 py-1.5 text-sm font-medium text-white transition-transform duration-100 ease-out active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50"
                onClick={capture}
                disabled={busy || starting}
              >
                Capture
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
