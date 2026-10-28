import { useEffect } from "react";
import Stamp from "../ui/Stamp";

export default function StampLanding({
  active,
  stampName,
  stampGraphicUrl,
  stampSignatureUrl,
  dateLabel,
  onfinish,
}: {
  active: boolean;
  stampName: string;
  stampGraphicUrl: string | null;
  stampSignatureUrl: string | null;
  dateLabel: string;
  onfinish: () => void;
}) {
  useEffect(() => {
    if (!active) return;
    const timer = setTimeout(() => onfinish(), 1600);
    return () => clearTimeout(timer);
  }, [active, onfinish]);

  if (!active) return null;
  return (
    <div
      className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center"
      style={{ background: "rgba(255,255,255,0.4)" }}
      aria-hidden="true"
    >
      <Stamp>
        <div className="flex h-full select-none flex-col items-center justify-center text-center">
          <p className="text-lg font-bold uppercase tracking-[0.25em] text-primary/80">
            Verified
          </p>
          <div className="mt-1 flex items-center justify-center gap-2">
            {stampGraphicUrl && (
              <img
                src={stampGraphicUrl}
                alt=""
                className="h-10 w-10 object-contain opacity-75"
                style={{ mixBlendMode: "multiply" }}
              />
            )}
            <div>
              <p className="text-sm font-semibold text-primary">{stampName}</p>
              <p className="text-xs tabular-nums text-primary/70">
                {dateLabel}
              </p>
            </div>
            {stampSignatureUrl && (
              <img
                src={stampSignatureUrl}
                alt=""
                className="h-8 w-8 object-contain opacity-75"
                style={{ mixBlendMode: "multiply" }}
              />
            )}
          </div>
        </div>
      </Stamp>
    </div>
  );
}
