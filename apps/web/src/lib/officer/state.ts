import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import { notify } from "$lib/notifications";
import { isUnread, markRead } from "$lib/officer/read-state";
import {
  TAB_BY_ID,
  TAB_BY_STEP,
  isOfficerTab,
  type OfficerTab,
} from "$lib/officer/tabs";
import type { ListItem, StepCode } from "$lib/officer/types";
import { useOfficerQueries } from "$lib/officer/queries";
import { useOfficerMutations } from "$lib/officer/mutations";

const STATUS_FILTERS = [
  "ALL",
  "PENDING",
  "SUBMITTED",
  "VERIFIED",
  "RETURNED",
] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];
const EVIDENCE_FILTERS = ["ALL", "HAS", "NONE"] as const;
type EvidenceFilter = (typeof EVIDENCE_FILTERS)[number];
const RANGE_FILTERS = ["ALL", "today", "7d", "30d", "year"] as const;
type RangeFilter = (typeof RANGE_FILTERS)[number];

/** React port of `createOfficerState` — URL params + the query/mutation slices. */
export function useOfficerState(officerId: string) {
  const [params, setParams] = useSearchParams();

  function updateUrl(updates: Record<string, string | null>) {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(updates)) {
      if (value === null) next.delete(key);
      else next.set(key, value);
    }
    setParams(next, { replace: true });
  }

  function param(name: string, fallback: string): string {
    return params.get(name) ?? fallback;
  }

  const activeTab: OfficerTab = (() => {
    const value = param("step", "overview");
    return isOfficerTab(value) ? value : "overview";
  })();

  const view = param("view", "table") === "cards" ? "cards" : "table";
  const sortField = (() => {
    const value = param("sort", "submittedAt");
    return value === "studentName" || value === "status"
      ? value
      : "submittedAt";
  })();
  const sortDir = param("dir", "asc") === "desc" ? "desc" : "asc";
  const pageNum = Math.max(1, Number.parseInt(param("page", "1")) || 1);
  const pageSize = (() => {
    const value = Number.parseInt(param("size", "50"), 10);
    return value === 25 || value === 100 ? value : 50;
  })();
  const searchQ = param("q", "");
  const statusFilter = (STATUS_FILTERS as readonly string[]).includes(
    param("status", "ALL"),
  )
    ? (param("status", "ALL") as StatusFilter)
    : "ALL";
  const evidenceFilterValue = param("evidence", "ALL");
  const evidenceFilter: EvidenceFilter =
    TAB_BY_ID.get(activeTab)?.stepCode !== "PROFILING" &&
    (evidenceFilterValue === "HAS" || evidenceFilterValue === "NONE")
      ? evidenceFilterValue
      : "ALL";
  const rangeFilterValue = param("range", "ALL");
  const rangeFilter: RangeFilter = (
    RANGE_FILTERS as readonly string[]
  ).includes(rangeFilterValue)
    ? (rangeFilterValue as RangeFilter)
    : "ALL";
  const unreadOnly = param("unread", "") === "1";
  const filterActive =
    Boolean(searchQ) ||
    statusFilter !== "ALL" ||
    evidenceFilter !== "ALL" ||
    rangeFilter !== "ALL" ||
    unreadOnly;

  function selectTab(tab: OfficerTab) {
    updateUrl({ step: tab === "overview" ? null : tab, page: null });
  }

  const activeStep: StepCode | null =
    TAB_BY_ID.get(activeTab)?.stepCode ?? null;

  function toast(message: string, kind: "success" | "error" = "success") {
    notify(message, kind);
  }

  const queries = useOfficerQueries({
    authenticated: Boolean(officerId),
    activeStep,
    pageNum,
    pageSize,
    sortField,
    sortDir,
    searchQ,
    statusFilter,
    evidenceFilter,
    rangeFilter,
  });
  const mutations = useOfficerMutations(toast);

  const [shortcutsOpen, setShortcutsOpenState] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);

  // Guide state (spec §3-§6)
  const [guideOpen, setGuideOpenState] = useState(false);
  const [guideStep, setGuideStep] = useState<1 | 2 | 3 | 4 | 5 | 6>(1);
  const [guideDontShow, setGuideDontShow] = useState(true);

  function setShortcutsOpen(v: boolean) {
    setShortcutsOpenState(v);
    if (v) setGuideOpenState(false);
  }
  function setGuideOpen(v: boolean) {
    setGuideOpenState(v);
    if (v) setShortcutsOpenState(false);
  }

  function openGuide(step: 1 | 2 | 3 | 4 | 5 | 6 = 1) {
    setGuideStep(step);
    setGuideOpenState(true);
    setShortcutsOpenState(false);
  }

  function reviewFromBell(item: {
    verificationId: string;
    stepCode: StepCode;
  }) {
    const tab = TAB_BY_STEP.get(item.stepCode);
    if (tab) selectTab(tab.id);
    setDetailId(item.verificationId);
  }

  const rawItems: ListItem[] = useMemo(
    () => queries.listQuery.data?.data ?? [],
    [queries.listQuery.data],
  );
  const [unreadIds, setUnreadIds] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    const next = new Set<string>();
    if (officerId) {
      for (const item of rawItems) {
        if (
          item.status !== "VERIFIED" &&
          isUnread(officerId, item.verificationId)
        ) {
          next.add(item.verificationId);
        }
      }
    }
    setUnreadIds(next);
  }, [officerId, rawItems]);

  function handleMarkRead(id: string) {
    if (!officerId) return;
    markRead(officerId, id);
    setUnreadIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }

  const items = unreadOnly
    ? rawItems.filter((i) => unreadIds.has(i.verificationId))
    : rawItems;
  const listData = queries.listQuery.data
    ? unreadOnly
      ? { ...queries.listQuery.data, data: items }
      : queries.listQuery.data
    : undefined;

  function moveSelection(delta: number) {
    if (items.length === 0) return;
    const current = items.findIndex((i) => i.verificationId === selectedId);
    const next = Math.min(
      items.length - 1,
      Math.max(
        0,
        current === -1 ? (delta > 0 ? 0 : items.length - 1) : current + delta,
      ),
    );
    setSelectedId(items[next].verificationId);
  }

  function openSelected() {
    if (selectedId) setDetailId(selectedId);
  }

  // The officer console is also open to ADMINs, but `/api/v1/me/overview`
  // returns the admin shape (stepTotals) for them — same normalization as
  // StepOverview so the step-tab badges read the right field either way.
  const counts: Partial<Record<StepCode, number>> = {};
  const countSteps: Array<{ code: StepCode; unverified?: number }> =
    queries.overviewQuery.data?.steps ??
    queries.overviewQuery.data?.stepTotals ??
    [];
  for (const step of countSteps) {
    counts[step.code] = step.unverified ?? 0;
  }

  // "N new since you last looked" — resets when the list key changes, then
  // counts rows that appear while you watch (spec: live list badge).
  const [newCount, setNewCount] = useState(0);
  const seen = useRef({ key: "", ids: new Set<string>() });

  useEffect(() => {
    const key = `${activeStep ?? "none"}|${pageNum}|${sortField}|${sortDir}|${pageSize}`;
    const rows: ListItem[] | undefined = queries.listQuery.data?.data;
    if (key !== seen.current.key) {
      seen.current.key = key;
      seen.current.ids = new Set();
      setNewCount(0);
    }
    if (seen.current.ids.size === 0 && rows) {
      seen.current.ids = new Set(rows.map((i) => i.verificationId));
      return;
    }
    if (!rows) return;
    let added = 0;
    for (const item of rows) {
      if (
        item.status !== "VERIFIED" &&
        !seen.current.ids.has(item.verificationId)
      )
        added += 1;
    }
    if (added > 0) {
      seen.current.ids = new Set(rows.map((i) => i.verificationId));
      setNewCount((n) => n + added);
    }
  }, [
    activeStep,
    pageNum,
    sortField,
    sortDir,
    pageSize,
    queries.listQuery.data,
  ]);

  // `GET /api/v1/me/overview` returns the admin shape (activeYear) when the
  // caller is an ADMIN — admins can open /officer. Normalize both shapes so
  // the reports tab reads the right active-year flag and label.
  const overviewRaw = queries.overviewQuery.data as
    | {
        hasActiveYear?: boolean;
        yearLabel?: string | null;
        activeYear?: { label: string; semesterLabel: string } | null;
      }
    | undefined;
  const hasActiveYear =
    overviewRaw?.hasActiveYear ?? overviewRaw?.activeYear != null;
  const yearLabel = overviewRaw?.yearLabel
    ? overviewRaw.yearLabel
    : overviewRaw?.activeYear
      ? `${overviewRaw.activeYear.label} · ${overviewRaw.activeYear.semesterLabel}`
      : null;
  const stepMeta = TAB_BY_ID.get(activeTab);

  return {
    activeTab,
    view,
    sortField,
    sortDir,
    pageNum,
    pageSize,
    searchQ,
    statusFilter,
    evidenceFilter,
    rangeFilter,
    unreadOnly,
    filterActive,
    activeStep,
    overviewQuery: queries.overviewQuery,
    bellQuery: queries.bellQuery,
    listQuery: queries.listQuery,
    profilingQuery: queries.profilingQuery,
    linksQuery: queries.linksQuery,
    saveFormMutation: mutations.saveFormMutation,
    removeFormMutation: mutations.removeFormMutation,
    saveLinkMutation: mutations.saveLinkMutation,
    deleteLinkMutation: mutations.deleteLinkMutation,
    reorderLinksMutation: mutations.reorderLinksMutation,
    shortcutsOpen,
    setShortcutsOpen,
    guideOpen,
    setGuideOpen,
    guideStep,
    setGuideStep,
    guideDontShow,
    setGuideDontShow,
    selectedId,
    setSelectedId,
    detailId,
    setDetailId,
    unreadIds,
    listData,
    items,
    counts,
    newCount,
    yearLabel,
    hasActiveYear,
    stepMeta,
    updateUrl,
    selectTab,
    toast,
    handleSaveForm: mutations.handleSaveForm,
    handleRemoveForm: mutations.handleRemoveForm,
    handleSaveLink: mutations.handleSaveLink,
    handleRemoveLink: mutations.handleRemoveLink,
    handleReorderLinks: mutations.handleReorderLinks,
    reviewFromBell,
    handleMarkRead,
    moveSelection,
    openSelected,
    clearNew() {
      setNewCount(0);
      seen.current.ids = new Set(rawItems.map((i) => i.verificationId));
    },
    openGuide,
  };
}
