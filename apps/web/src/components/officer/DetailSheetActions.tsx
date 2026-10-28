import StampButton from "./StampButton";

export default function DetailSheetActions({
  isVerified,
  busyAny,
  replyOpen,
  sendBackLabel,
  revokeBusy,
  onstamp,
  onrevoke,
  ontogglesendback,
}: {
  isVerified: boolean;
  busyAny: boolean;
  replyOpen: boolean;
  sendBackLabel: string;
  revokeBusy: boolean;
  onstamp: () => void;
  onrevoke: () => void;
  ontogglesendback: () => void;
}) {
  return (
    <div className="border-t border-border bg-chrome px-5 py-3 backdrop-blur-md">
      {isVerified ? (
        <button
          type="button"
          className="press rounded-lg px-3 py-2 text-sm font-semibold text-error transition-transform duration-100 ease-out hover:bg-error/5 active:scale-[0.97] disabled:opacity-50"
          onClick={onrevoke}
          disabled={revokeBusy}
        >
          Revoke stamp
        </button>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <StampButton
            label="Stamp as verified"
            disabled={busyAny}
            onclick={onstamp}
          />
          <button
            type="button"
            className={`press rounded-lg px-3 py-2 text-sm text-muted transition-transform duration-100 ease-out hover:bg-surface hover:text-ink active:scale-[0.97] ${replyOpen ? "bg-surface" : ""}`}
            onClick={ontogglesendback}
          >
            {sendBackLabel}
          </button>
        </div>
      )}
    </div>
  );
}
