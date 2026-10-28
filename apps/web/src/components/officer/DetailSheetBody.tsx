import ReplyComposer from "./ReplyComposer";
import DriveThumb from "../DriveThumb";
import { absoluteTime, relativeTime } from "$lib/officer/format";
import type { StepCode, StepDetailData, StepStatus } from "$lib/officer/types";

const REPLY_CHIPS: Record<StepCode, string[]> = {
  ASSESSMENT: [
    "Balance not yet settled",
    "Go to SBO office for payment",
    "Incomplete requirements",
  ],
  SOCIAL_MEDIA: [
    "Wrong screenshot",
    "Did not like/follow all pages",
    "Screenshot unclear",
  ],
  PROFILING: [
    "Response not found in sheet",
    "Wrong success page",
    "Screenshot unclear",
  ],
  MUGSHOT: ["Photo not clear", "Not a mugshot", "Wrong angle"],
  CONSENT: ["Wrong document", "Scan unreadable", "Missing signature"],
};

function domainBadge(url: string): string {
  try {
    const h = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
    if (h === "drive.google.com") return "drive.google.com";
    if (h === "storage.to" || h.endsWith(".storage.to")) return "storage.to";
    return h;
  } catch {
    return "";
  }
}

export default function DetailSheetBody({
  data,
  status,
  reply,
  stamp,
  revocation,
  replyOpen,
  replyBusy,
  captureBusy,
  captureDismissed,
  onclose,
  onopenlightbox,
  oncapturesave,
  oncapturecancel,
  onshowcamera,
  onreplyclose,
  onreplysend,
}: {
  data: StepDetailData;
  status: StepStatus;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  reply: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  stamp: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  revocation: any;
  replyOpen: boolean;
  replyBusy: boolean;
  captureBusy: boolean;
  captureDismissed: boolean;
  onclose: () => void;
  onopenlightbox: (i: number) => void;
  oncapturesave: (dataUrl: string) => void;
  oncapturecancel: () => void;
  onshowcamera: () => void;
  onreplyclose: () => void;
  onreplysend: (chips: string[], note: string) => void;
}) {
  const replyChips = REPLY_CHIPS[data.step.code] ?? [];
  const externalLinks = (data.evidence ?? []).filter(
    (e: { kind: string }) => e.kind === "EXTERNAL_LINK",
  );
  const imageEvidence = (data.evidence ?? []).filter(
    (e: { kind: string }) => e.kind !== "EXTERNAL_LINK",
  );

  return (
    <>
      <header className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
        <div className="flex min-w-0 items-start gap-3">
          {data.student.image ? (
            <img
              src={data.student.image}
              alt=""
              loading="lazy"
              className="h-10 w-10 shrink-0 rounded-full object-cover"
            />
          ) : null}
          <div className="min-w-0">
            <h2 className="truncate text-lg font-semibold tracking-tight">
              {data.student.name}
            </h2>
            <p className="text-sm text-muted tabular-nums">
              {data.student.studentNumber ?? ""}
            </p>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <span className="text-sm text-muted">{data.step.name}</span>
              {status === "VERIFIED" ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-primary/40 px-2.5 py-0.5 text-xs font-medium text-primary">
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    aria-hidden="true"
                  >
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                  Verified
                </span>
              ) : status === "RETURNED" ? (
                <span className="rounded-full bg-warning/10 px-2.5 py-0.5 text-xs font-medium text-warning">
                  Returned
                </span>
              ) : (
                <span className="rounded-full border border-border bg-surface px-2.5 py-0.5 text-xs font-medium text-muted">
                  Pending
                </span>
              )}
              <span
                className="text-xs text-muted"
                title={absoluteTime(data.submittedAt)}
              >
                {relativeTime(data.submittedAt)}
              </span>
            </div>
          </div>
        </div>
        <button
          type="button"
          aria-label="Close"
          className="rounded-lg p-2 text-muted transition-[transform,background-color] duration-100 ease-out hover:bg-surface hover:text-ink active:scale-[0.97]"
          onClick={onclose}
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
      </header>

      <div className="flex-1 overflow-y-auto px-5 pb-4">
        {data.step.code === "ASSESSMENT" && (
          <section className="py-4">
            <h3 className="text-sm font-semibold tracking-tight">
              Requirements
            </h3>
            <ul className="mt-2 space-y-1.5">
              {data.requirements.map((req: { id: string; label: string }) => (
                <li key={req.id} className="flex items-start gap-2 text-sm">
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    aria-hidden="true"
                    className="mt-0.5 shrink-0 text-primary"
                  >
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                  <span>{req.label}</span>
                </li>
              ))}
            </ul>
            <div className="mt-3 rounded-lg bg-warning/10 p-3 text-sm text-warning">
              Check SIMS balance before stamping — opens externally.
            </div>
          </section>
        )}

        {(data.step.code === "PROFILING" || data.answers?.length > 0) && (
          <section className="border-t border-border py-4">
            <h3 className="text-sm font-semibold tracking-tight">
              Google Form response
            </h3>
            <p className="mt-1 text-xs text-muted">
              {data.student.email ?? "Unknown email"} ·{" "}
              {absoluteTime(data.submittedAt)}
            </p>
            {!data.answers?.length && (
              <p className="mt-3 text-sm text-muted">No answers recorded.</p>
            )}
            <dl className="mt-3 space-y-3">
              {data.answers.map(
                (a: { label: string; value: string }, i: number) => (
                  <div key={i}>
                    <dt className="text-xs text-muted">{a.label}</dt>
                    <dd className="whitespace-pre-wrap text-sm text-ink">
                      {a.value}
                    </dd>
                  </div>
                ),
              )}
            </dl>
          </section>
        )}

        {data.step.code !== "ASSESSMENT" && data.evidence.length > 0 && (
          <section className="border-t border-border py-4">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold tracking-tight">Evidence</h3>
              <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted tabular-nums">
                {data.evidence.length}{" "}
                {data.evidence.length === 1 ? "item" : "items"}
              </span>
            </div>
            {externalLinks.length > 0 && (
              <div className="mt-3 space-y-2">
                {externalLinks.map((link: { id: string; fileUrl: string }) => (
                  <div
                    key={link.id}
                    className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2"
                  >
                    <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                      {domainBadge(link.fileUrl)}
                    </span>
                    <span
                      className="min-w-0 flex-1 truncate text-sm text-ink"
                      title={link.fileUrl}
                    >
                      {link.fileUrl}
                    </span>
                    <a
                      href={link.fileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="shrink-0 rounded-lg bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primary/90"
                    >
                      Open
                    </a>
                  </div>
                ))}
              </div>
            )}
            {imageEvidence.length === 1 ? (
              <div className="mt-2">
                <div
                  data-evidence-thumb
                  data-index={0}
                  className="thumb relative flex max-h-[360px] w-full cursor-zoom-in items-center justify-center overflow-hidden rounded-lg border border-border bg-surface transition-transform duration-100 ease-out active:scale-[0.98] hover:ring-1 hover:ring-primary/20"
                >
                  <DriveThumb
                    item={imageEvidence[0]}
                    alt=""
                    className="h-auto max-h-[360px] w-full object-contain"
                    label="Open evidence image 1 — click to expand fullscreen"
                    onClick={() => onopenlightbox(0)}
                  />
                </div>
                <p className="mt-1.5 text-xs text-muted">
                  Click image to view fullscreen — click again to return
                </p>
              </div>
            ) : imageEvidence.length > 1 ? (
              <div className="mt-2 grid grid-cols-4 gap-2">
                {imageEvidence.map(
                  (
                    item: {
                      id: string;
                      fileUrl: string;
                      fileKey?: string | null;
                      mime?: string | null;
                      name?: string | null;
                    },
                    i: number,
                  ) => (
                    <div
                      key={item.id}
                      data-evidence-thumb
                      data-index={i}
                      className="thumb relative aspect-square cursor-zoom-in overflow-hidden rounded-lg border border-border bg-surface transition-transform duration-100 ease-out active:scale-95 hover:ring-1 hover:ring-primary/20"
                    >
                      <DriveThumb
                        item={item}
                        alt=""
                        className="h-full w-full object-cover"
                        label={`Open evidence image ${i + 1} — click to expand fullscreen`}
                        onClick={() => onopenlightbox(i)}
                      />
                    </div>
                  ),
                )}
              </div>
            ) : null}
          </section>
        )}

        {replyOpen && (
          <section className="border-t border-border py-4">
            <ReplyComposer
              open={true}
              chips={replyChips}
              busy={replyBusy}
              onsend={onreplysend}
              oncancel={onreplyclose}
            />
          </section>
        )}

        {reply && (
          <section className="border-t border-border py-4">
            <div className="rounded-lg border border-border bg-surface p-3">
              <h3 className="text-sm font-semibold tracking-tight">
                Reply sent
              </h3>
              {reply.chips.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {reply.chips.map((chip: string) => (
                    <span
                      key={chip}
                      className="rounded-full border border-border bg-surface-raised px-2.5 py-0.5 text-xs text-muted"
                    >
                      {chip}
                    </span>
                  ))}
                </div>
              )}
              {reply.note && <p className="mt-2 text-sm">{reply.note}</p>}
              <p className="mt-2 text-xs text-muted">
                Returned by{" "}
                <span className="font-medium text-ink">
                  {reply.respondedByName}
                </span>{" "}
                · {absoluteTime(reply.respondedAt)}
              </p>
            </div>
          </section>
        )}

        {stamp && (
          <section className="border-t border-border py-3">
            <p className="text-sm text-muted">
              Stamped by{" "}
              <span className="font-medium text-ink">{stamp.stampName}</span> ·{" "}
              {absoluteTime(stamp.verifiedAt)}
              {stamp.stampGraphicUrl && (
                <img
                  src={stamp.stampGraphicUrl}
                  alt=""
                  loading="lazy"
                  className="ml-1 inline h-5 w-5 object-contain opacity-75"
                  style={{ mixBlendMode: "multiply" }}
                />
              )}
            </p>
            {revocation && (
              <p className="mt-1 text-sm text-muted">
                Revoked by{" "}
                <span className="font-medium text-ink">
                  {revocation.revokedByName}
                </span>{" "}
                · {absoluteTime(revocation.revokedAt)}
              </p>
            )}
          </section>
        )}
      </div>
    </>
  );
}
