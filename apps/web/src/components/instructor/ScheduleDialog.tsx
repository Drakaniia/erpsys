import { useEffect, useState } from "react";
import { SCHEDULE_SLOT_MINUTES, WEEKDAY_LABELS } from "$lib/domain/constants";
import type { WindowKind } from "$lib/domain/types";
import { notify } from "$lib/notifications";
import {
  KIND_LABEL,
  SYNC_LABEL,
  newRow,
  rowsToWindows,
  useCalendarActions,
  useCalendarStatus,
  useSaveSchedule,
  useSchedule,
  windowsToRows,
  type ScheduleRow,
} from "$lib/instructor/schedule";
import ModalShell from "../ui/ModalShell";

const FIELD =
  "rounded-lg border border-border bg-surface px-2 py-1.5 text-sm text-ink";
const GHOST =
  "rounded-lg px-3 py-1.5 text-sm text-muted transition-[transform,color] duration-100 ease-out hover:text-ink active:scale-[0.97] disabled:opacity-50";

function CalendarSection({ departmentSync }: { departmentSync?: string }) {
  const status = useCalendarStatus().data;
  const actions = useCalendarActions();
  const [busy, setBusy] = useState(false);
  if (!status?.available) return null;

  async function run(action: () => Promise<void>) {
    setBusy(true);
    try {
      await action();
    } catch (e) {
      notify.error((e as Error).message || "Google Calendar request failed.");
    } finally {
      setBusy(false);
    }
  }

  const connected = status.status !== "NOT_CONNECTED";
  return (
    <section
      aria-label="Google Calendar"
      className="rounded-xl border border-border bg-surface px-3.5 py-3"
    >
      <p className="text-sm font-medium text-ink">Google Calendar</p>
      <p className="mt-0.5 text-sm text-muted" aria-live="polite">
        {connected
          ? `${status.googleEmail ?? "Connected"} · ${SYNC_LABEL[status.sync]}`
          : "Optional — mirror these hours to a calendar in your Google account."}
      </p>
      {departmentSync === "PENDING" ? (
        <p className="mt-1 text-sm text-muted">
          Saved. Google sync will retry shortly.
        </p>
      ) : null}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {!connected || status.status === "NEEDS_RECONNECT" ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void run(actions.connect)}
            className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          >
            {connected ? "Reconnect Google Calendar" : "Connect Google Calendar"}
          </button>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={() => void run(actions.sync)}
            className={GHOST}
          >
            Sync now
          </button>
        )}
        {connected ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void run(actions.disconnect)}
            className={GHOST}
          >
            Disconnect
          </button>
        ) : null}
      </div>
    </section>
  );
}

export default function ScheduleDialog({
  open,
  department,
  onclose,
}: {
  open: boolean;
  department: { id: string; name: string };
  onclose: () => void;
}) {
  const schedule = useSchedule(department.id, open);
  const save = useSaveSchedule();
  const [rows, setRows] = useState<ScheduleRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [sync, setSync] = useState<string | undefined>();

  useEffect(() => {
    if (open && schedule.data) {
      setRows(windowsToRows(schedule.data.windows));
      setError(null);
      setSync(undefined);
    }
  }, [open, schedule.data]);

  function patch(key: number, change: Partial<ScheduleRow>) {
    setRows((all) => all.map((r) => (r.key === key ? { ...r, ...change } : r)));
  }

  async function submit() {
    setError(null);
    if (rows.some((r) => r.kind !== "WEEKLY" && !r.date)) {
      setError("Pick a date for every one-off or skipped day.");
      return;
    }
    try {
      const saved = await save.mutateAsync({
        departmentId: department.id,
        windows: rowsToWindows(rows),
      });
      setSync(saved.sync);
      notify.success("Schedule saved.");
      if (saved.sync !== "PENDING") onclose();
    } catch (e) {
      setError((e as Error).message || "Could not save the schedule.");
    }
  }

  return (
    <ModalShell
      open={open}
      labelledby="schedule-title"
      title="Office-hour schedule"
      subtitle={department.name}
      size="lg"
      onclose={onclose}
      footer={
        <div className="flex items-center justify-between gap-3 px-5 pb-5 pt-3">
          <p className="text-xs text-muted">Times are Philippine time.</p>
          <div className="flex gap-2">
            <button type="button" onClick={onclose} className={GHOST}>
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void submit()}
              disabled={save.isPending || schedule.isPending}
              className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
            >
              {save.isPending ? "Saving…" : "Save schedule"}
            </button>
          </div>
        </div>
      }
    >
      <div className="max-h-[60dvh] space-y-3 overflow-y-auto px-5">
        <p className="text-sm text-muted">
          Students see these hours on the queue card. They never open or close
          the queue — the “Accepting students” switch still does that.
        </p>
        {schedule.isError ? (
          <p className="text-sm text-error">Couldn&apos;t load your schedule.</p>
        ) : null}
        {rows.length === 0 && !schedule.isPending ? (
          <p className="rounded-xl border border-border bg-surface px-3 py-3 text-sm text-muted">
            No hours posted yet.
          </p>
        ) : null}
        <ul className="space-y-2">
          {rows.map((row) => (
            <li
              key={row.key}
              className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2"
            >
              <select
                aria-label="Type"
                value={row.kind}
                onChange={(e) =>
                  patch(row.key, { kind: e.target.value as WindowKind })
                }
                className={FIELD}
              >
                {(Object.keys(KIND_LABEL) as WindowKind[]).map((kind) => (
                  <option key={kind} value={kind}>
                    {KIND_LABEL[kind]}
                  </option>
                ))}
              </select>
              {row.kind === "WEEKLY" ? (
                <select
                  aria-label="Weekday"
                  value={row.weekday}
                  onChange={(e) =>
                    patch(row.key, { weekday: Number(e.target.value) })
                  }
                  className={FIELD}
                >
                  {WEEKDAY_LABELS.map((label, index) => (
                    <option key={label} value={index + 1}>
                      {label}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="date"
                  aria-label="Date"
                  value={row.date}
                  onChange={(e) => patch(row.key, { date: e.target.value })}
                  className={FIELD}
                />
              )}
              {row.kind !== "CANCEL" ? (
                <>
                  <input
                    type="time"
                    aria-label="Start"
                    step={SCHEDULE_SLOT_MINUTES * 60}
                    value={row.start}
                    onChange={(e) => patch(row.key, { start: e.target.value })}
                    className={FIELD}
                  />
                  <span className="text-muted" aria-hidden="true">
                    –
                  </span>
                  <input
                    type="time"
                    aria-label="End"
                    step={SCHEDULE_SLOT_MINUTES * 60}
                    value={row.end}
                    onChange={(e) => patch(row.key, { end: e.target.value })}
                    className={FIELD}
                  />
                </>
              ) : null}
              <button
                type="button"
                aria-label="Remove"
                onClick={() => setRows((all) => all.filter((r) => r.key !== row.key))}
                className="ml-auto text-sm text-muted hover:text-error"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={() => setRows((all) => [...all, newRow()])}
          className={GHOST}
        >
          + Add hours
        </button>
        {error ? (
          <p className="text-sm text-error" role="alert">
            {error}
          </p>
        ) : null}
        <CalendarSection departmentSync={sync} />
      </div>
    </ModalShell>
  );
}
