import { useEffect, useState } from "react";
import { shortcutBlocked } from "$lib/ui/shortcut-guard";
import { useNavigate } from "react-router";

import OfficerBell from "../components/officer/OfficerBell";
import OfficerReportsTab from "../components/officer/OfficerReportsTab";
import OfficerTabBar from "../components/officer/OfficerTabBar";
import ProfilingFormPanel from "../components/officer/ProfilingFormPanel";
import ShortcutsPopover from "../components/ui/ShortcutsPopover";
import SimsPanel from "../components/officer/SimsPanel";
import SocialMediaLinksPanel from "../components/officer/SocialMediaLinksPanel";
import StepOverview from "../components/officer/StepOverview";
import SubmissionList from "../components/officer/SubmissionList";
import DetailSheet from "../components/officer/DetailSheet";
import ConsoleOnboarding, {
  OnboardingHelp,
} from "../components/ui/ConsoleOnboarding";
import { OFFICER_TIPS } from "$lib/officer/onboarding";
import PageLoader from "../components/ui/PageLoader";
import { authClient } from "$lib/auth-client";
import { loginRouteForSessionLoss } from "$lib/auth/session-guard";
import { homeRouteForRole } from "$lib/auth/redirect";
import { useOfficerState } from "$lib/officer/state";
import { getOfficerShortcutAction } from "$lib/officer/shortcuts";
import { OFFICER_TABS } from "$lib/officer/tabs";
import { isSimsWarm, rememberSimsWarm } from "$lib/officer/sims";

const shortcuts = [
  { action: "Step tabs (Assessment–Consent)", keys: ["1–5"] },
  { action: "Social Media Links", keys: ["6"] },
  { action: "Profiling Form", keys: ["7"] },
  { action: "Overview", keys: ["0", "H"] },
  { action: "Move rows", keys: ["J", "K", "↑", "↓"] },
  { action: "Open detail", keys: ["Enter"] },
  { action: "Stamp (in detail)", keys: ["S"] },
  { action: "Close sheet / lightbox / dialog", keys: ["Esc"] },
  { action: "This popover", keys: ["?"] },
];

export function OfficerPage() {
  const navigate = useNavigate();
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
    if (role !== "SBO_OFFICER" && role !== "ADMIN") {
      navigate(homeRouteForRole(role), { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionQuery.isPending, user?.role]);

  const officerId = user?.id ?? "";
  const s = useOfficerState(officerId);

  const withSims = s.activeTab === "assessment";
  const [simsMounted, setSimsMounted] = useState(isSimsWarm);
  useEffect(() => {
    if (!withSims) return;
    setSimsMounted(true);
    rememberSimsWarm();
  }, [withSims]);

  useEffect(() => {
    function onKeydown(e: KeyboardEvent) {
      const typing = shortcutBlocked(e);
      const action = getOfficerShortcutAction(e.key, {
        isTyping: typing,

        hasDetailSheet: s.detailId !== null,
      });
      if (!action) {
        if (typing || s.detailId !== null) return;
        const tab = OFFICER_TABS.find((t) => t.key === e.key);
        if (!tab) return;
        e.preventDefault();
        s.selectTab(tab.id);
        return;
      }
      e.preventDefault();
      switch (action.type) {
        case "toggleShortcuts":
          s.setShortcutsOpen(!s.shortcutsOpen);
          break;
        case "selectTab":
          s.selectTab(action.tab);
          break;
        case "moveSelection":
          s.moveSelection(action.delta);
          break;
        case "openSelected":
          s.openSelected();
          break;
      }
    }
    window.addEventListener("keydown", onKeydown);
    return () => window.removeEventListener("keydown", onKeydown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.detailId, s.shortcutsOpen]);

  if (sessionQuery.isPending || !sessionQuery.data) {
    return <PageLoader label="Loading the officer console" />;
  }

  const shellWidth = withSims ? "max-w-[1600px]" : "max-w-[1200px]";

  return (
    <ConsoleOnboarding
      key={officerId}
      surface="officer"
      accountId={officerId}
      tips={OFFICER_TIPS}
    >
      <OfficerTabBar
        active={s.activeTab}
        counts={s.counts}
        onselect={s.selectTab}
      />

      <header
        className={`mx-auto flex w-full ${shellWidth} items-center justify-between gap-4 px-6 pb-2 pt-4`}
      >
        <div>
          <h1
            className="text-xl font-semibold tracking-tight"
            data-onboarding-tip={
              s.activeTab === "profiling-form" ||
              s.activeTab === "social-media-links"
                ? s.activeTab
                : undefined
            }
          >
            {s.activeTab === "overview"
              ? "Officer Overview"
              : s.activeTab === "reports"
                ? "Reports"
                : s.activeTab === "profiling-form"
                  ? "Profiling Form"
                  : s.activeTab === "social-media-links"
                    ? "Social Media Links"
                    : (s.stepMeta?.label ?? "Officer")}
          </h1>
        </div>
        <div className="relative flex items-center gap-3">
          {s.yearLabel && (
            <span className="text-sm text-muted tabular-nums">
              {s.yearLabel}
            </span>
          )}
          <button
            className="text-muted transition-[transform,color] duration-100 ease-out hover:text-ink active:scale-[0.97]"
            data-shortcuts-trigger
            aria-label="Keyboard shortcuts"
            aria-expanded={s.shortcutsOpen}
            onClick={() => s.setShortcutsOpen(!s.shortcutsOpen)}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              aria-hidden="true"
            >
              <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
              <path d="M12 17h.01" />
              <circle cx="12" cy="12" r="9" />
            </svg>
          </button>
          <OnboardingHelp />
          <OfficerBell
            count={s.bellQuery.data?.total ?? 0}
            isLoading={s.bellQuery.isPending && !s.bellQuery.data}
            items={(s.bellQuery.data?.data ?? []).map((item: any) => ({
              verificationId: item.verificationId,
              studentName: item.student?.name ?? "Unknown",
              stepCode: item.stepCode,
              stepName: item.stepName ?? "",
              submittedAt: item.submittedAt,
            }))}
            onreview={s.reviewFromBell}
          />
          <ShortcutsPopover
            open={s.shortcutsOpen}
            onclose={() => s.setShortcutsOpen(false)}
            id="officer-shortcuts-popover"
            shortcuts={shortcuts}
          />
        </div>
      </header>

      <main
        className={`mx-auto w-full ${shellWidth} flex-1 overflow-y-auto px-6 pb-8 ${
          withSims
            ? "grid content-start items-start gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]"
            : ""
        }`}
      >
        {s.activeTab === "overview" ? (
          <StepOverview
            data={s.overviewQuery.data}
            isLoading={s.overviewQuery.isPending && !s.overviewQuery.data}
            onopenstep={s.selectTab}
          />
        ) : s.activeTab === "profiling-form" ? (
          <ProfilingFormPanel
            data={s.profilingQuery.data}
            isLoading={s.profilingQuery.isPending && !s.profilingQuery.data}
            hasActiveYear={s.hasActiveYear}
            onsave={s.handleSaveForm}
            onremove={s.handleRemoveForm}
            busy={
              s.saveFormMutation.isPending || s.removeFormMutation.isPending
            }
          />
        ) : s.activeTab === "social-media-links" ? (
          <SocialMediaLinksPanel
            data={s.linksQuery.data?.data}
            isLoading={s.linksQuery.isPending && !s.linksQuery.data}
            busy={
              s.saveLinkMutation.isPending ||
              s.deleteLinkMutation.isPending ||
              s.reorderLinksMutation.isPending
            }
            onsave={s.handleSaveLink}
            onremove={s.handleRemoveLink}
            onreorder={s.handleReorderLinks}
          />
        ) : s.activeTab === "reports" ? (
          <OfficerReportsTab
            hasActiveYear={s.hasActiveYear}
            yearLabel={s.yearLabel}
          />
        ) : s.activeStep ? (
          <SubmissionList
            step={s.activeStep}
            data={s.listData}
            isLoading={s.listQuery.isPending}
            isError={s.listQuery.isError}
            view={s.view as "table" | "cards"}
            sort={s.sortField as "submittedAt" | "studentName" | "status"}
            dir={s.sortDir as "asc" | "desc"}
            page={s.pageNum}
            pageSize={s.pageSize}
            unreadIds={s.unreadIds}
            selectedId={s.selectedId}
            q={s.searchQ}
            evidence={s.evidenceFilter}
            range={s.rangeFilter}
            unreadOnly={s.unreadOnly}
            filterActive={s.filterActive}
            onqchange={(v) => s.updateUrl({ q: v || null, page: null })}
            onevidencechange={(v) =>
              s.updateUrl({ evidence: v === "ALL" ? null : v, page: null })
            }
            onrangechange={(v) =>
              s.updateUrl({ range: v === "ALL" ? null : v, page: null })
            }
            onunreadtoggle={() =>
              s.updateUrl({ unread: s.unreadOnly ? null : "1", page: null })
            }
            onclearfilters={() =>
              s.updateUrl({
                q: null,
                status: null,
                evidence: null,
                range: null,
                unread: null,
                page: null,
              })
            }
            onselect={(id) => s.setSelectedId(id)}
            onviewchange={(v) =>
              s.updateUrl({ view: v === "cards" ? "cards" : null })
            }
            onsortchange={(ss, d) =>
              s.updateUrl({ sort: ss, dir: d, page: null })
            }
            onpagechange={(p) =>
              s.updateUrl({ page: p === 1 ? null : String(p) })
            }
            onpagesizechange={(n) =>
              s.updateUrl({ size: n === 50 ? null : String(n), page: null })
            }
            onrefresh={async () => {
              await s.listQuery.refetch();
              s.clearNew();
              s.toast("Refreshed");
            }}
            isRefetching={s.listQuery.isFetching}
            newCount={s.newCount}
            onnewseend={s.clearNew}
            onopen={(id) => {
              s.setSelectedId(id);
              s.setDetailId(id);
              s.clearNew();
            }}
          />
        ) : null}
        {simsMounted ? <SimsPanel hidden={!withSims} /> : null}
      </main>

      <DetailSheet
        verificationId={s.detailId}
        onclose={() => s.setDetailId(null)}
        onmarkread={s.handleMarkRead}
      />
    </ConsoleOnboarding>
  );
}
