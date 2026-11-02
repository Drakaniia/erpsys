import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router";
import { notify } from "$lib/notifications";
import { useCalendarActions, useCalendarStatus } from "$lib/instructor/schedule";

export default function CalendarBanner() {
  const status = useCalendarStatus().data;
  const actions = useCalendarActions();
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const outcome = params.get("calendar");

  useEffect(() => {
    if (!outcome) return;
    if (outcome === "connected") notify.success("Google Calendar connected.");
    else notify.error("Google Calendar wasn't connected.");
    setParams(
      (prev) => {
        prev.delete("calendar");
        return prev;
      },
      { replace: true },
    );
    void queryClient.invalidateQueries({ queryKey: ["instructor"] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [outcome]);

  if (!status?.available || status.status !== "NEEDS_RECONNECT") return null;
  return (
    <div
      role="status"
      className="mb-4 flex items-center justify-between gap-4 rounded-xl border border-warning/25 bg-warning/10 px-4 py-3"
    >
      <p className="text-sm text-ink">
        Google Calendar needs you to reconnect.{" "}
        <span className="text-muted">
          Your schedule and queue keep working; syncing is paused.
        </span>
      </p>
      <button
        type="button"
        onClick={() => void actions.connect()}
        className="shrink-0 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-white"
      >
        Reconnect
      </button>
    </div>
  );
}
