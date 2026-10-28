import { useEffect, useRef, useState } from "react";

const MAX_BYTES = 10 * 1024 * 1024;
const MAX_EDGE = 1920;

export default function CameraCapture({
  enabled,
  busy,
  oncapture,
  onswitchtab,
}: {
  enabled: boolean;
  busy: boolean;
  oncapture: (file: File) => void;
  onswitchtab: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraStarting, setCameraStarting] = useState(false);
  const [captured, setCaptured] = useState<string | null>(null);
  const [captureBusy, setCaptureBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function start() {
      if (!enabled || streamRef.current || cameraError) return;
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraError(
          "Camera unavailable — use file upload or paste a link instead.",
        );
        return;
      }
      setCameraStarting(true);
      setCameraError(null);
      try {
        const s = await navigator.mediaDevices.getUserMedia({
          video: { width: 1280, height: 960 },
          audio: false,
        });
        if (cancelled) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = s;
        if (videoRef.current) {
          videoRef.current.srcObject = s;
          await videoRef.current.play().catch(() => {});
        }
      } catch {
        if (!cancelled)
          setCameraError(
            "Camera unavailable — use file upload or paste a link instead.",
          );
      } finally {
        if (!cancelled) setCameraStarting(false);
      }
    }
    void start();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      setCaptured(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  function captureFrame() {
    const videoEl = videoRef.current;
    if (!videoEl || !streamRef.current) return;
    const naturalWidth = videoEl.videoWidth;
    const naturalHeight = videoEl.videoHeight;
    if (!naturalWidth || !naturalHeight) return;
    const scale = Math.min(1, MAX_EDGE / Math.max(naturalWidth, naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(naturalWidth * scale);
    canvas.height = Math.round(naturalHeight * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
    setCaptured(canvas.toDataURL("image/jpeg", 0.85));
    videoEl.pause();
  }

  function retake() {
    setCaptured(null);
    videoRef.current?.play().catch(() => {});
  }

  async function useCaptured() {
    if (!captured) return;
    setCaptureBusy(true);
    try {
      const blob = await (await fetch(captured)).blob();
      const file = new File([blob], `capture-${Date.now()}.jpg`, {
        type: "image/jpeg",
      });
      if (file.size > MAX_BYTES) {
        setCameraError("File too large — max 10 MB.");
        setCaptureBusy(false);
        return;
      }
      oncapture(file);
      setCaptured(null);
    } catch {
      setCameraError("Capture failed — try again.");
    } finally {
      setCaptureBusy(false);
    }
  }

  return (
    <div id="tab-camera" role="tabpanel">
      {cameraError ? (
        <div className="rounded-xl border border-border bg-surface p-4 text-center">
          <p className="text-sm text-muted">{cameraError}</p>
          <button
            type="button"
            onClick={onswitchtab}
            className="mt-3 rounded-lg border border-border bg-surface-raised px-3 py-1.5 text-sm font-medium text-ink hover:bg-surface"
          >
            Use file upload
          </button>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-surface">
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
                {cameraStarting ? (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <p className="text-sm text-white/80">Starting camera…</p>
                  </div>
                ) : (
                  <span className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-ink/60 px-2.5 py-1 text-xs text-white">
                    <span className="h-1.5 w-1.5 rounded-full bg-error" /> Live
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
                  className="rounded-lg border border-border bg-surface-raised px-3 py-1.5 text-sm text-ink disabled:opacity-50"
                  onClick={retake}
                  disabled={captureBusy || busy}
                >
                  Retake
                </button>
                <button
                  type="button"
                  className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
                  onClick={useCaptured}
                  disabled={captureBusy || busy}
                >
                  {captureBusy ? "Saving…" : "Use photo"}
                </button>
              </>
            ) : (
              <button
                type="button"
                className="rounded-lg bg-primary px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50"
                onClick={captureFrame}
                disabled={cameraStarting || captureBusy}
              >
                Capture
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
