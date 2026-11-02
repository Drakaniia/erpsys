import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { useMutation, useQuery } from "@tanstack/react-query";

import { notify } from "$lib/notifications";
import { authClient } from "$lib/auth-client";
import { loginRouteForSessionLoss } from "$lib/auth/session-guard";
import { homeRouteForRole } from "$lib/auth/redirect";
import {
  isAdminTab,
  TAB_BY_ID,
  TAB_BY_KEY,
  type AdminTab,
} from "$lib/admin/tabs";
import { api, queryClient } from "$lib/api";
import { LAUNCH_STALE_MS } from "$lib/perf/cache-policy";
import { intervalWhileVisible } from "$lib/polling";
import type { RoleFilter } from "$lib/admin/types";

/** The shortcut legend shown in the header popover (§4, §7.6). */
export const ADMIN_SHORTCUTS = [
  { action: "Overview", keys: ["0", "H"] },
  { action: "Users", keys: ["1"] },
  { action: "Departments", keys: ["2"] },
  { action: "Adviser Mapping", keys: ["3"] },
  { action: "Academic Years", keys: ["4"] },
  { action: "Requirements", keys: ["5"] },
  { action: "Profiling Form", keys: ["6"] },
  { action: "Chatbot Knowledge", keys: ["7"] },
  { action: "Integrations", keys: ["8"] },
  { action: "Move rows", keys: ["J", "K", "↑", "↓"] },
  { action: "Open / confirm", keys: ["Enter"] },
  { action: "Close dialog / popover", keys: ["Esc"] },
  { action: "This popover", keys: ["?"] },
];

/**
 * Number keys come from the one numbering source (`ADMIN_TABS[].key`), not a
 * hand-written map — which is what let the legend and the array drift apart.
 */

/**
 * Everything the admin console shell renders from: URL-backed filters, the two
 * polling queries, the profiling-form mutation, the per-tab refresh/leave-guard
 * registries, and the keyboard shortcuts. Kept in a hook so `admin-page.tsx`
 * reads as layout rather than state wiring.
 */
export function useAdminConsole() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();

  // Router-aware query updates (replaces lib/url history.replaceState, which
  // bypasses React Router so useSearchParams never re-renders — tabs changed
  // the URL but not the page).
  function updateUrl(updates: Record<string, string | null>) {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(updates)) {
      if (value === null) next.delete(key);
      else next.set(key, value);
    }
    setParams(next, { replace: true });
  }

  const sessionQuery = authClient.useSession();
  const user = sessionQuery.data?.user as
    | { id?: string; role?: string }
    | undefined;

  useEffect(() => {
    if (sessionQuery.isPending) return;
    if (!user) {
      navigate(loginRouteForSessionLoss(), { replace: true });
      return;
    }
    const role = user.role;
    if (role !== "ADMIN") {
      navigate(homeRouteForRole(role), { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionQuery.isPending, user?.role]);

  function param(name: string, fallback: string): string {
    return params.get(name) ?? fallback;
  }

  const tabValue = param("tab", "overview");
  const activeTab: AdminTab = isAdminTab(tabValue) ? tabValue : "overview";

  const roleValue = param("role", "ALL");
  const roleFilter: RoleFilter =
    roleValue === "STUDENT" ||
    roleValue === "SBO_OFFICER" ||
    roleValue === "ENROLLMENT_ADVISER" ||
    roleValue === "ADMIN"
      ? roleValue
      : "ALL";
  const outsideFilter: "ALL" | "INSIDE" | "OUTSIDE" =
    param("outside", "ALL") === "OUTSIDE"
      ? "OUTSIDE"
      : param("outside", "ALL") === "INSIDE"
        ? "INSIDE"
        : "ALL";
  const searchQ = param("q", "");
  const pageNum = Math.max(1, Number.parseInt(param("page", "1"), 10) || 1);
  const pageSize = (() => {
    const value = Number.parseInt(param("size", "50"), 10);
    return value === 25 || value === 100 ? value : 50;
  })();

  const overviewQuery = useQuery(
    api.admin.getOverview.queryOptions({
      staleTime: LAUNCH_STALE_MS,
      enabled: Boolean(user?.id),
      refetchInterval: intervalWhileVisible(30_000),
      refetchOnWindowFocus: true,
    }),
  );
  const profilingQuery = useQuery(
    api.admin.getProfilingForm.queryOptions({
      staleTime: LAUNCH_STALE_MS,
      enabled: Boolean(user?.id),
      refetchInterval: intervalWhileVisible(30_000),
    }),
  );

  const hasActiveYear = overviewQuery.data?.activeYear != null;
  const yearLabel = overviewQuery.data?.activeYear
    ? `${overviewQuery.data.activeYear.label} · ${overviewQuery.data.activeYear.semesterLabel}`
    : null;

  const saveFormMutation = useMutation(
    api.admin.createProfilingForm.mutationOptions(),
  );
  const removeFormMutation = useMutation(
    api.admin.deleteProfilingForm.mutationOptions(),
  );

  function toast(message: string, kind: "success" | "error" = "success") {
    notify(message, kind);
  }

  async function handleSaveForm(title: string) {
    try {
      await saveFormMutation.mutateAsync({ title });
      void profilingQuery.refetch();
      toast("Google Form created");
    } catch (e) {
      toast((e as Error).message || "Could not create the Google Form", "error");
    }
  }

  async function handleRemoveForm() {
    try {
      await removeFormMutation.mutateAsync(undefined);
      void profilingQuery.refetch();
      toast("Profiling form unlinked");
    } catch {
      toast("Could not unlink the profiling form", "error");
    }
  }

  const refreshHandlers = useRef(
    new Map<AdminTab, () => Promise<unknown> | void>(),
  );

  function registerRefresh(tab: AdminTab, fn: () => Promise<unknown> | void) {
    refreshHandlers.current.set(tab, fn);
  }

  const [refreshing, setRefreshing] = useState(false);

  async function refreshActiveTab() {
    if (refreshing) return;
    setRefreshing(true);
    try {
      const handler = refreshHandlers.current.get(activeTab);
      if (handler) await handler();
      else if (activeTab === "overview") await overviewQuery.refetch();
      else if (activeTab === "students")
        await queryClient.invalidateQueries({
          queryKey: ["instructor", "getRosterBoard"],
        });
      toast("Refreshed");
    } finally {
      setRefreshing(false);
    }
  }

  const leaveGuards = useRef(new Map<AdminTab, () => Promise<boolean>>());

  function registerLeaveGuard(tab: AdminTab, fn: () => Promise<boolean>) {
    leaveGuards.current.set(tab, fn);
  }

  async function selectTab(tab: AdminTab) {
    if (tab === activeTab) return;
    const guard = leaveGuards.current.get(activeTab);
    if (guard) {
      const ok = await guard();
      if (!ok) return;
    }
    updateUrl({
      tab: tab === "overview" ? null : tab,
      page: null,
      q: null,
      integration: null,
    });
  }

  // ---- First-run navigation (§5.3) ----
  function goToYears() {
    void selectTab("academic-years");
  }

  function openUsersFiltered(role: RoleFilter) {
    updateUrl({
      tab: "users",
      role: role === "STUDENT" ? null : role,
      page: null,
    });
  }

  // ---- Keyboard (§4, §7.6) ----
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  useEffect(() => {
    function onKeydown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const typing =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);
      if (typing) return;

      if (e.key === "?") {
        e.preventDefault();
        setShortcutsOpen((prev) => !prev);
        return;
      }
      if (e.key === "0" || e.key.toLowerCase() === "h") {
        e.preventDefault();
        void selectTab("overview");
        return;
      }
      const tab = TAB_BY_KEY.get(e.key);
      if (tab) {
        if (TAB_BY_ID.get(tab)?.requiresYear && !hasActiveYear) return;
        e.preventDefault();
        void selectTab(tab);
        return;
      }
    }
    window.addEventListener("keydown", onKeydown);
    return () => window.removeEventListener("keydown", onKeydown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, hasActiveYear]);

  const tabTitle = TAB_BY_ID.get(activeTab)?.label ?? "Admin";

  return {
    sessionQuery,
    user,
    activeTab,
    roleFilter,
    outsideFilter,
    searchQ,
    pageNum,
    pageSize,
    overviewQuery,
    profilingQuery,
    hasActiveYear,
    yearLabel,
    saveFormMutation,
    removeFormMutation,
    toast,
    handleSaveForm,
    handleRemoveForm,
    registerRefresh,
    refreshing,
    refreshActiveTab,
    registerLeaveGuard,
    selectTab,
    goToYears,
    openUsersFiltered,
    shortcutsOpen,
    setShortcutsOpen,
    tabTitle,
    updateUrl,
  };
}
