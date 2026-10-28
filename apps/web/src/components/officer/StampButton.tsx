export default function StampButton({
  label,
  disabled = false,
  onclick,
}: {
  label: string;
  disabled?: boolean;
  onclick: () => void;
}) {
  return (
    <button
      type="button"
      className="press rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition-transform duration-100 ease-out active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50"
      disabled={disabled}
      onClick={onclick}
    >
      {label}
    </button>
  );
}
