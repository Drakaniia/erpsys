export default function AllSetBanner({
  variant,
  onjoin,
}: {
  variant: "ready" | "done";
  onjoin: () => void;
}) {
  return (
    <div className="banner-card overflow-hidden rounded-[20px] border border-ink/[0.06] bg-surface-raised p-4 shadow-[0_1px_2px_rgba(16,24,40,0.05)]">
      {variant === "ready" ? (
        <div className="flex flex-col gap-3">
          <p className="text-[17px] font-semibold leading-snug tracking-[-0.01em] text-ink">
            All 5 steps complete — you can now join the enrollment queue.
          </p>
          <button
            type="button"
            onClick={onjoin}
            className="flex h-12 items-center justify-center rounded-2xl bg-primary px-4 text-[17px] font-semibold text-white transition-[scale,filter] duration-100 ease-out hover:brightness-105 active:scale-[0.98] motion-reduce:active:scale-none"
          >
            Join the queue
          </button>
        </div>
      ) : (
        <p className="flex items-center gap-2 text-[17px] font-semibold tracking-[-0.01em] text-primary">
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
            <path d="M20 6 9 17l-5-5" />
          </svg>
          You&apos;re enrolled — all steps complete.
        </p>
      )}
    </div>
  );
}
