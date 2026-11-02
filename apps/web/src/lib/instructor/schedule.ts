import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "$lib/api";
import type {
  CalendarStatus,
  ScheduleView,
  ScheduleWindow,
  SyncState,
  WindowKind,
} from "$lib/domain/types";

export type ScheduleRow = {
  key: number;
  kind: WindowKind;
  weekday: number;
  date: string;
  start: string;
  end: string;
};

export const KIND_LABEL: Record<WindowKind, string> = {
  WEEKLY: "Every week",
  EXTRA: "One extra day",
  CANCEL: "Skip a day",
};

export const SYNC_LABEL: Record<SyncState, string> = {
  NOT_CONNECTED: "Not connected",
  SYNCED: "In sync with Google Calendar",
  PENDING: "Saved — Google sync pending",
  NEEDS_RECONNECT: "Google needs you to reconnect",
  FAILED: "Google sync failed",
};

export function minuteToTime(minute: number): string {
  const h = String(Math.floor(minute / 60)).padStart(2, "0");
  return `${h}:${String(minute % 60).padStart(2, "0")}`;
}

export function timeToMinute(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

let nextKey = 1;

export function newRow(kind: WindowKind = "WEEKLY"): ScheduleRow {
  return {
    key: nextKey++,
    kind,
    weekday: 1,
    date: "",
    start: "09:00",
    end: "12:00",
  };
}

export function windowsToRows(windows: ScheduleWindow[]): ScheduleRow[] {
  return windows.map((w) => ({
    key: nextKey++,
    kind: w.kind,
    weekday: w.weekday ?? 1,
    date: w.date ?? "",
    start: minuteToTime(w.startMinute ?? 540),
    end: minuteToTime(w.endMinute ?? 720),
  }));
}

export function rowsToWindows(rows: ScheduleRow[]): ScheduleWindow[] {
  return rows.map((r) => {
    if (r.kind === "CANCEL") return { kind: r.kind, date: r.date };
    const times = {
      startMinute: timeToMinute(r.start),
      endMinute: timeToMinute(r.end),
    };
    return r.kind === "WEEKLY"
      ? { kind: r.kind, weekday: r.weekday, ...times }
      : { kind: r.kind, date: r.date, ...times };
  });
}

export function useSchedule(departmentId: string, enabled: boolean) {
  return useQuery(
    api.instructor.getMySchedule.queryOptions({
      input: { departmentId },
      enabled,
    }),
  ) as { data: ScheduleView | undefined; isPending: boolean; isError: boolean };
}

export function useSaveSchedule() {
  const queryClient = useQueryClient();
  return useMutation<
    ScheduleView,
    Error,
    { departmentId: string; windows: ScheduleWindow[] }
  >({
    mutationFn: (input) =>
      api.instructor.saveMySchedule.call(input) as Promise<ScheduleView>,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["instructor"] });
      void queryClient.invalidateQueries({ queryKey: ["student"] });
    },
  });
}

export function useCalendarStatus() {
  return useQuery(
    api.instructor.getMyCalendar.queryOptions({ staleTime: 30_000 }),
  ) as { data: CalendarStatus | undefined };
}

export function useCalendarActions() {
  const queryClient = useQueryClient();
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ["instructor", "getMyCalendar"] });
  return {
    connect: async () => {
      const { url } = (await api.instructor.connectCalendar.call()) as {
        url: string;
      };
      window.location.assign(url);
    },
    sync: async () => {
      await api.instructor.syncCalendar.call();
      await refresh();
    },
    disconnect: async () => {
      await api.instructor.disconnectCalendar.call();
      await refresh();
    },
  };
}
