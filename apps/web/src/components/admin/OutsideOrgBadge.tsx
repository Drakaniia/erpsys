export default function OutsideOrgBadge({ outside }: { outside: boolean }) {
  if (!outside) return null;
  return (
    <span className="inline-flex items-center rounded-full bg-warning/10 px-2 py-0.5 text-[11px] font-medium text-warning">
      outside org
    </span>
  );
}
