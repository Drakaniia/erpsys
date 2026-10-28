import { absoluteTime } from "$lib/officer/format";

export default function ReplyNotice({
  reply,
}: {
  reply: {
    chips: string[];
    note: string | null;
    respondedByName: string;
    respondedAt: string;
  };
}) {
  return (
    <div className="rounded-2xl border border-warning/25 bg-warning/10 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-warning">
        Returned by the officer
      </p>
      {reply.chips.length > 0 ? (
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {reply.chips.map((chip) => (
            <li
              key={chip}
              className="rounded-full border border-warning/30 bg-surface px-2.5 py-1 text-xs text-ink/90"
            >
              {chip}
            </li>
          ))}
        </ul>
      ) : null}
      {reply.note ? (
        <p className="mt-2 text-sm text-ink">{reply.note}</p>
      ) : null}
      <p className="mt-2 text-[11px] text-muted">
        {reply.respondedByName} · {absoluteTime(reply.respondedAt)}
      </p>
    </div>
  );
}
