import DitherLoader from "./DitherLoader";

export default function PageLoader({
  label = "Loading",
  className = "",
}: {
  label?: string;
  className?: string;
}) {
  return (
    <div
      className={`flex min-h-dvh w-full flex-col items-center justify-center ${className}`}
      role="status"
      aria-live="polite"
    >
      <DitherLoader size="md" />
      <span className="sr-only">{label}</span>
    </div>
  );
}
