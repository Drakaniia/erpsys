import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router";
import { authClient } from "$lib/auth-client";
import { notify } from "$lib/notifications";
import { prefersReducedMotion, UI_SPRING } from "$lib/motion";
import { useSpring } from "$lib/ui/use-spring";
import { chipFor, STEP_META, STEP_ORDER } from "$lib/student/steps";
import { parseStudentTab, type StudentTab } from "$lib/student/tabs";
import type { NotificationItem, StepCode } from "$lib/student/types";
import { api } from "$lib/api";
import { LAUNCH_STALE_MS, visibleQueuePosition } from "$lib/perf/cache-policy";
import { intervalWhileVisible } from "$lib/polling";
import { connectLiveUpdates } from "$lib/live-updates";
import {
  refreshStudentQueries,
  STUDENT_BACKSTOP_POLL_MS,
} from "./live-refresh";

export const EVIDENCE_CONFIG: Partial<
  Record<
    StepCode,
    { label: string; hint?: string; note?: string; multiple?: boolean }
  >
> = {
  SOCIAL_MEDIA: {
    label: "Upload screenshot",
    hint: "Screenshot of your liked/followed pages",
    multiple: true,
  },
  MUGSHOT: {
    label: "Upload photo",
    hint: "JPEG, PNG or WebP — max 4 MB",
    note: "Upload a photo, or have an SBO officer capture it at the office.",
  },
  CONSENT: {
    label: "Upload signed papers",
    hint: "Scan or photo — parent consent + medical form",
    note: "Signed parent consent + medical form.",
  },
};

/** React port of `createStudentState` — the student progress surface. */
export function useStudentState(_email: string) {
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();

  function updateUrl(updates: Record<string, string | null>) {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(updates)) {
      if (value === null) next.delete(key);
      else next.set(key, value);
    }
    setParams(next, { replace: true });
  }

  useEffect(
    () => connectLiveUpdates((event) => refreshStudentQueries(event.topic)),
    [],
  );

  const sessionQuery = authClient.useSession();
  const sessionReady = !sessionQuery.isPending && Boolean(sessionQuery.data);

  const stepsQuery = useQuery(
    api.student.getMySteps.queryOptions({
      staleTime: LAUNCH_STALE_MS,
      // No session, no request: without this the sign-out race fires
      // /api/v1/me/* against the cleared cookie and each lands a 401.
      enabled: sessionReady,
      refetchInterval: intervalWhileVisible(STUDENT_BACKSTOP_POLL_MS),
      refetchOnWindowFocus: true,
    }),
  );
  const queueQuery = useQuery(
    api.student.getMyQueueStatus.queryOptions({
      staleTime: LAUNCH_STALE_MS,
      enabled: sessionReady,
      refetchInterval: intervalWhileVisible(STUDENT_BACKSTOP_POLL_MS),
      refetchOnWindowFocus: true,
    }),
  );
  const notificationsQuery = useQuery(
    api.notifications.listMine.queryOptions({
      staleTime: LAUNCH_STALE_MS,
      enabled: sessionReady,
      refetchInterval: intervalWhileVisible(STUDENT_BACKSTOP_POLL_MS),
      refetchOnWindowFocus: true,
    }),
  );

  const data: any = stepsQuery.data;
  const queue: any = queueQuery.data;
  const queuePosition = visibleQueuePosition(
    queue?.position,
    queueQuery.dataUpdatedAt,
  );
  const queuePositionFresh = queuePosition != null;
  const readyForQueue = data?.readyForQueue ?? false;
  const allComplete = data?.allComplete ?? false;
  // Server-owned aggregates; the local count stays as fallback for cached or
  // mocked payloads that predate the fields.
  const verifiedCount =
    data?.verifiedCount ??
    ((data?.steps ?? []) as any[]).filter((s) => s.status === "VERIFIED")
      .length;
  const progressPercent =
    data?.progressPercent ??
    Math.round((verifiedCount / STEP_ORDER.length) * 100);

  const [pillScale, setPillScale] = useSpring(1, UI_SPRING);
  const prevVerified = useRef(-1);
  useEffect(() => {
    if (!data) return;
    if (prevVerified.current === -1) {
      prevVerified.current = verifiedCount;
      return;
    }
    if (prevVerified.current === verifiedCount) return;
    prevVerified.current = verifiedCount;
    if (prefersReducedMotion()) return;
    setPillScale(0.8);
    const raf = requestAnimationFrame(() => setPillScale(1));
    return () => cancelAnimationFrame(raf);
  }, [data, verifiedCount, setPillScale]);

  const activeTab = parseStudentTab(params.get("tab"));

  const stepNumberToCode = new Map(
    STEP_ORDER.map((code, i) => [String(i + 1), code]),
  );

  const [openCode, setOpenCode] = useState<StepCode | null>(null);

  function codeFromParam(): StepCode | null {
    const raw = params.get("step");
    if (!raw) return null;
    const upper = raw.toUpperCase();
    if ((STEP_ORDER as string[]).includes(upper)) return upper as StepCode;
    return stepNumberToCode.get(raw) ?? null;
  }

  // Deep link: `?step=3` (or a step code) opens that sheet.
  useEffect(() => {
    const code = codeFromParam();
    if (code) setOpenCode(code);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  function selectTab(tab: StudentTab) {
    const updates: Record<string, string | null> = {
      tab: tab === "progress" ? null : tab,
    };
    if (tab !== "progress" && openCode) {
      updates.step = null;
      setOpenCode(null);
    }
    updateUrl(updates);
  }

  function openStep(code: StepCode) {
    setOpenCode(code);
    updateUrl({ step: String(STEP_ORDER.indexOf(code) + 1) });
  }

  function closeSheet() {
    if (!openCode) return;
    setOpenCode(null);
    updateUrl({ step: null });
  }

  // Refs, not locals: these must survive re-renders, exactly like the
  // module-scope `let`s in the rune version.
  const queueInitialized = useRef(false);
  const sawCompleted = useRef(false);

  function isSuccessDismissed(yearId: string | null | undefined): boolean {
    if (!yearId) return false;
    try {
      return (
        localStorage.getItem(`erpsys-enrollment-success-${yearId}`) === "1"
      );
    } catch {
      return false;
    }
  }
  function markSuccessDismissed(yearId: string | null | undefined) {
    if (!yearId) return;
    try {
      localStorage.setItem(`erpsys-enrollment-success-${yearId}`, "1");
    } catch {
      /* storage unavailable */
    }
  }

  const [successOpen, setSuccessOpenState] = useState(false);
  function setSuccessOpen(v: boolean) {
    setSuccessOpenState(v);
    if (!v) markSuccessDismissed(data?.academicYearId);
  }

  useEffect(() => {
    if (!queue) {
      queueInitialized.current = false;
      return;
    }
    if (!queueInitialized.current) {
      queueInitialized.current = true;
      sawCompleted.current = queue.status === "COMPLETED";
      if (
        queue.status === "COMPLETED" &&
        !isSuccessDismissed(data?.academicYearId)
      ) {
        setSuccessOpenState(true);
      } else if (
        data?.allComplete &&
        !isSuccessDismissed(data?.academicYearId)
      ) {
        setSuccessOpenState(true);
      }
      return;
    }
    if (queue.status === "COMPLETED") {
      if (!sawCompleted.current) {
        sawCompleted.current = true;
        if (!isSuccessDismissed(data?.academicYearId))
          setSuccessOpenState(true);
      }
    } else {
      sawCompleted.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queue, data]);

  useEffect(() => {
    if (!data?.allComplete) return;
    if (isSuccessDismissed(data.academicYearId)) return;
    if (!successOpen && !sawCompleted.current) {
      if (queue?.status !== "COMPLETED") setSuccessOpenState(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, queue, successOpen]);

  const SEEN_KEY = "erpsys-seen-years";
  const [rolloverNotice, setRolloverNotice] = useState(false);
  useEffect(() => {
    if (!data?.academicYearId) return;
    const parseSeen = (): string[] => {
      try {
        const raw = localStorage.getItem(SEEN_KEY);
        return raw ? (JSON.parse(raw) as string[]) : [];
      } catch {
        return [];
      }
    };
    const seen = parseSeen();
    if (!seen.includes(data.academicYearId)) {
      setRolloverNotice(true);
      seen.push(data.academicYearId);
      try {
        localStorage.setItem(SEEN_KEY, JSON.stringify(seen));
      } catch {
        /* storage unavailable */
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.academicYearId]);

  const saveNumberMutation = useMutation(
    api.student.saveStudentNumber.mutationOptions(),
  );
  const [numberError, setNumberError] = useState<string | null>(null);

  const showOnboarding = (() => {
    if (!data) return false;
    const missingEnrollment = !data.profile.enrollment;
    const missingNumber =
      !data.profile.studentNumber && !data.profile.derivedStudentNumber;
    return Boolean(missingEnrollment || missingNumber);
  })();

  function toast(message: string, kind: "success" | "error" = "success") {
    notify(message, kind);
  }

  async function handleSaveNumber(value: string) {
    setNumberError(null);
    try {
      await saveNumberMutation.mutateAsync({ studentNumber: value });
      queryClient.invalidateQueries({ queryKey: ["student"] });
      toast("Student number saved");
    } catch (e) {
      setNumberError(
        (e as { message?: string }).message ?? "Could not save — try again.",
      );
    }
  }

  function viewNotification(item: NotificationItem) {
    for (const code of STEP_ORDER) {
      if (item.title.startsWith(STEP_META[code].name)) {
        openStep(code);
        return;
      }
    }
  }

  const openStepRow =
    ((data?.steps ?? []) as any[]).find((s) => s.code === openCode) ?? null;
  const sheetChip = openStepRow
    ? chipFor(openStepRow)
    : { label: "", classes: "" };
  const showNoYear = Boolean(data && !data.hasActiveYear);
  const showPrompt = Boolean(
    data &&
    data.hasActiveYear &&
    !data.profile.studentNumber &&
    !data.profile.derivedStudentNumber,
  );

  return {
    stepsQuery,
    queueQuery,
    notificationsQuery,
    data,
    queue,
    queuePosition,
    queuePositionFresh,
    readyForQueue,
    allComplete,
    verifiedCount,
    progressPercent,
    pillScale,
    activeTab,
    openCode,
    setOpenCode,
    successOpen,
    setSuccessOpen,
    rolloverNotice,
    numberError,
    setNumberError,
    saveNumberMutation,
    openStepRow,
    sheetChip,
    showNoYear,
    showPrompt,
    showOnboarding,
    selectTab,
    openStep,
    closeSheet,
    handleSaveNumber,
    viewNotification,
    toast,
    updateUrl,
  };
}
