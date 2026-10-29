import AppleSwitch from "../ui/AppleSwitch";

export default function AvailabilitySwitch({
  checked,
  disabled = false,
  busy = false,
  colleagueName = null,
  onchange,
}: {
  checked: boolean;
  disabled?: boolean;
  busy?: boolean;
  colleagueName?: string | null;
  onchange: (next: boolean) => void;
}) {
  if (colleagueName) {
    return (
      <>
        <span className="flex items-center gap-1.5 text-sm text-muted">
          <span
            className="h-2 w-2 rounded-full bg-primary"
            aria-hidden="true"
          />
          Open by {colleagueName}
        </span>
        <AppleSwitch checked={false} interactive={false} />
      </>
    );
  }
  return (
    <AppleSwitch
      checked={checked}
      disabled={disabled}
      busy={busy}
      label="Accepting students"
      description="Closes automatically when you sign out — your department assignment stays."
      onchange={(next) => onchange(next)}
    />
  );
}
