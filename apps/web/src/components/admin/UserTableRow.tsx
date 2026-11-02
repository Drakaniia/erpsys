import RoleChip from "./RoleChip";
import OutsideOrgBadge from "./OutsideOrgBadge";
import { relativeTime, absoluteTime, initials } from "$lib/officer/format";

export default function UserTableRow({
  item,
  myId,
  selected,
  onToggle,
  onSelectRow,
  admin,
}: {
  item: any;
  myId: string;
  selected: boolean;
  onToggle: (id: string) => void;
  onSelectRow: (id: string) => void;
  admin: any;
}) {
  const isMe = item.id === myId;
  const lever = item.role === "STUDENT" || item.role === "SBO_OFFICER";
  const demoteDisabled = item.role === "SBO_OFFICER" && isMe;
  return (
    <tr
      key={item.id}
      className={`h-[52px] ${selected ? "bg-primary/5" : "hover:bg-surface"}`}
      onClick={() => onSelectRow(item.id)}
      aria-selected={selected}
    >
      <td className="px-4">
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onToggle(item.id)}
          aria-label={`Select ${item.name}`}
          className="h-4 w-4 accent-primary"
        />
      </td>
      <td className="px-2 py-2">
        <div className="flex min-w-0 items-center gap-3">
          {item.image ? (
            <img
              src={item.image}
              alt=""
              loading="lazy"
              className="h-8 w-8 shrink-0 rounded-full object-cover"
            />
          ) : (
            <span
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary"
              aria-hidden="true"
            >
              {initials(item.name)}
            </span>
          )}
          <div className="min-w-0">
            <p className="truncate font-medium text-ink">{item.name}</p>
            <p className="truncate text-xs text-muted">{item.email}</p>
          </div>
        </div>
      </td>
      <td className="px-2 py-2 tabular-nums text-muted">
        {item.studentNumber ?? "—"}
      </td>
      <td className="px-2 py-2">
        <div className="flex items-center gap-2">
          <RoleChip role={item.role} />
          {item.blocked && (
            <span
              className="rounded-full border border-border bg-surface px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted"
              title="This account is disabled"
            >
              Blocked
            </span>
          )}
        </div>
      </td>
      <td className="px-2 py-2">
        <OutsideOrgBadge outside={item.isOutsideOrg} />
      </td>
      <td
        className="px-2 py-2 text-xs text-muted"
        title={absoluteTime(item.joinedAt)}
      >
        {relativeTime(item.joinedAt)}
      </td>
      <td className="px-2 py-2 text-right">
        {item.blocked ? (
          <span className="inline-flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => admin.setPurgeTarget(item)}
              className="rounded-md px-2 py-1 text-xs font-medium text-error transition-[transform,background-color] duration-100 ease-out hover:bg-error/10 active:scale-[0.97]"
            >
              Delete permanently
            </button>
          </span>
        ) : item.role !== "ADMIN" ? (
          <span className="inline-flex items-center justify-end gap-2">
            {lever &&
              (item.role === "STUDENT" ? (
                <button
                  type="button"
                  onClick={() => admin.askSingle(item, "SBO_OFFICER")}
                  className="rounded-md px-2 py-1 text-xs font-medium text-primary transition-[transform,background-color] duration-100 ease-out hover:bg-primary/10 active:scale-[0.97]"
                >
                  Promote
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => admin.askSingle(item, "STUDENT")}
                  disabled={demoteDisabled}
                  title={
                    demoteDisabled ? "You cannot demote yourself." : undefined
                  }
                  className="rounded-md px-2 py-1 text-xs font-medium text-ink/70 transition-[transform,background-color] duration-100 ease-out hover:bg-surface hover:text-ink active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Demote
                </button>
              ))}
            <button
              type="button"
              onClick={() => admin.askDelete(item)}
              className="rounded-md px-2 py-1 text-xs font-medium text-error/80 transition-[transform,background-color] duration-100 ease-out hover:bg-error/10 hover:text-error active:scale-[0.97]"
            >
              Delete
            </button>
          </span>
        ) : null}
      </td>
    </tr>
  );
}
