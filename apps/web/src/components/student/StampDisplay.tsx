import { absoluteTime } from "$lib/officer/format";
import Stamp from "../ui/Stamp";

export default function StampDisplay({
  stampName,
  stampGraphicUrl = null,
  stampSignatureUrl = null,
  verifiedAt,
  verifiedByName,
  verb = "Verified by",
}: {
  stampName: string;
  stampGraphicUrl?: string | null;
  stampSignatureUrl?: string | null;
  verifiedAt: string;
  verifiedByName: string;
  verb?: string;
}) {
  return (
    <section aria-label="Verified" className="pt-2">
      <p className="sr-only" aria-live="polite">
        Verified
      </p>
      <div className="flex items-center justify-center py-4">
        <Stamp>
          <div className="relative flex h-full flex-col items-center justify-center text-center">
            <p className="text-lg font-bold uppercase tracking-[0.2em] text-primary/80">
              Verified
            </p>
            <div className="relative mt-1 flex items-center justify-center">
              {stampGraphicUrl ? (
                <img
                  src={stampGraphicUrl}
                  alt=""
                  loading="lazy"
                  className="h-10 w-10 object-contain opacity-75"
                  style={{ mixBlendMode: "multiply" }}
                />
              ) : null}
              <div className="mx-2 text-center">
                <p className="text-sm font-semibold text-primary">
                  {stampName}
                </p>
                <p className="text-xs tabular-nums text-primary/70">
                  {absoluteTime(verifiedAt)}
                </p>
              </div>
            </div>
            {stampSignatureUrl ? (
              <img
                src={stampSignatureUrl}
                alt=""
                loading="lazy"
                className="pointer-events-none absolute inset-0 m-auto h-16 w-32 object-contain opacity-70"
                style={{
                  mixBlendMode: "multiply",
                  transform: "rotate(-12deg)",
                }}
              />
            ) : null}
          </div>
        </Stamp>
      </div>
      <p className="mt-2 text-center text-xs text-muted">
        {verb} <span className="font-medium text-ink/80">{verifiedByName}</span>{" "}
        · {absoluteTime(verifiedAt)}
      </p>
    </section>
  );
}
