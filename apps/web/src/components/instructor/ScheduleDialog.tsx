import { useEffect, useState, useRef } from "react";
import { useEditTimestamp } from "$lib/edit-timestamp";
import { ApiClientError, TS_ABORTED } from "$lib/api";
import { SCHEDULE_SLOT_MINUTES, WEEKDAY_LABELS } from "$lib/domain/constants";
import type { WindowKind } from "$lib/domain/types";
import { notify } from "$lib/notifications";
import {
  KIND_LABEL,
  SYNC_LABEL,
  newRow,
  rowsToWindows,
  timeToMinute,
  useCalendarActions,
  useCalendarStatus,
  useSaveSchedule,
  useSchedule,
  windowsToRows,
  type ScheduleRow,
} from "$lib/instructor/schedule";
import ModalShell from "../ui/ModalShell";
import FilterDropdown from "../ui/FilterDropdown";

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
        <a
          href="https://calendar.google.com/"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Open Google Calendar (opens in a new tab)"
          className={GHOST}
        >
          Open Google Calendar
        </a>
        {!connected || status.status === "NEEDS_RECONNECT" ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void run(actions.connect)}
            className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          >
            {connected
              ? "Reconnect Google Calendar"
              : "Connect Google Calendar"}
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

export default function ScheduleDialog(props: {
  open: boolean;
  department: { id: string; name: string };
  onclose: () => void;
}) {
  return props.open ? (
    <ScheduleEditor key={props.department.id} {...props} />
  ) : null;
}

function ScheduleEditor({
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
  const presence = useEditTimestamp(
    "schedule",
    open ? `me~${department.id}` : null,
    schedule.data,
  );
  const initialized = useRef(false);
  const [baseline, setBaseline] = useState("");
  const [conflict, setConflict] = useState(false);
  const [rows, setRows] = useState<ScheduleRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [sync, setSync] = useState<string | undefined>();

  useEffect(() => {
    if (!open) initialized.current = false;
    if (open && schedule.data && !schedule.isFetching && !initialized.current) {
      initialized.current = true;
      const loaded = windowsToRows(schedule.data.windows);
      presence.saved(schedule.data);
      setRows(loaded);
      setBaseline(JSON.stringify(rowsToWindows(loaded)));
      setError(null);
      setSync(undefined);
    }
  }, [open, schedule.data, schedule.isFetching]);

  const dirty = JSON.stringify(rowsToWindows(rows)) !== baseline;
  const ready = initialized.current && !schedule.isError;
  function close() {
    if (save.isPending) return;
    if (dirty && !window.confirm("Discard unsaved schedule changes?")) return;
    onclose();
  }

  function patch(key: number, change: Partial<ScheduleRow>) {
    setRows((all) => all.map((r) => (r.key === key ? { ...r, ...change } : r)));
  }

  async function submit() {
    if (!ready || !dirty || save.isPending || conflict) return;
    setError(null);
    if (rows.some((r) => r.kind !== "WEEKLY" && !r.date)) {
      setError("Pick a date for every one-off or skipped day.");
      return;
    }
    if (
      rows.some(
        (r) =>
          r.kind !== "CANCEL" &&
          (!r.start ||
            !r.end ||
            timeToMinute(r.start) % SCHEDULE_SLOT_MINUTES !== 0 ||
            timeToMinute(r.end) % SCHEDULE_SLOT_MINUTES !== 0 ||
            timeToMinute(r.end) - timeToMinute(r.start) <
              SCHEDULE_SLOT_MINUTES),
      )
    ) {
      setError(
        `Times must be on a ${SCHEDULE_SLOT_MINUTES}-minute grid and last at least ${SCHEDULE_SLOT_MINUTES} minutes.`,
      );
      return;
    }
    try {
      const saved = await save.mutateAsync({
        departmentId: department.id,
        windows: rowsToWindows(rows),
        ts: presence.ts,
      });
      presence.saved(saved);
      setBaseline(JSON.stringify(rowsToWindows(rows)));
      setSync(saved.sync);
      notify.success("Schedule saved.");
      if (saved.sync !== "PENDING") onclose();
    } catch (e) {
      setConflict(
        e instanceof ApiClientError &&
          (e.data as { code?: string } | undefined)?.code === TS_ABORTED,
      );
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
      onclose={close}
      footer={
        <div className="flex items-center justify-between gap-3 px-5 pb-5 pt-3">
          <p className="text-xs text-muted">Times are Philippine time.</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={close}
              disabled={save.isPending}
              className={GHOST}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void submit()}
              disabled={save.isPending || !ready || !dirty || conflict}
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
          <div role="alert" className="text-sm text-error">
            Couldn&apos;t load your schedule.
            <button
              type="button"
              className={GHOST}
              onClick={() => void schedule.refetch()}
            >
              Retry
            </button>
          </div>
        ) : null}
        {rows.length === 0 && ready ? (
          <p className="rounded-xl border border-border bg-surface px-3 py-3 text-sm text-muted">
            No hours posted yet.
          </p>
        ) : null}
        <fieldset
          disabled={!ready || save.isPending || conflict}
          className="space-y-2"
        >
          <legend className="sr-only">Schedule hours</legend>
          <ul className="space-y-2">
            {rows.map((row) => (
              <li
                key={row.key}
                className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2"
              >
                <FilterDropdown
                  ariaLabel="Type"
                  value={row.kind}
                  onchange={(value) =>
                    patch(row.key, { kind: value as WindowKind })
                  }
                  options={(Object.keys(KIND_LABEL) as WindowKind[]).map(
                    (kind) => ({
                      value: kind,
                      label: KIND_LABEL[kind],
                    }),
                  )}
                  disabled={!ready || save.isPending || conflict}
                  compact
                />
                {row.kind === "WEEKLY" ? (
                  <FilterDropdown
                    ariaLabel="Weekday"
                    value={String(row.weekday)}
                    onchange={(value) =>
                      patch(row.key, { weekday: Number(value) })
                    }
                    options={WEEKDAY_LABELS.map((label, index) => ({
                      value: String(index + 1),
                      label,
                    }))}
                    disabled={!ready || save.isPending || conflict}
                    compact
                  />
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
                      onChange={(e) =>
                        patch(row.key, { start: e.target.value })
                      }
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
                  onClick={() =>
                    setRows((all) => all.filter((r) => r.key !== row.key))
                  }
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
        </fieldset>
        {conflict ? (
          <button
            type="button"
            className={GHOST}
            onClick={async () => {
              if (
                !window.confirm(
                  "Discard your draft and reload the saved schedule?",
                )
              )
                return;
              const result = await schedule.refetch();
              if (result.isError || !result.data) return;
              const loaded = windowsToRows(result.data.windows);
              presence.saved(result.data);
              setRows(loaded);
              setBaseline(JSON.stringify(rowsToWindows(loaded)));
              setConflict(false);
              setError(null);
            }}
          >
            Reload saved schedule
          </button>
        ) : null}
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
