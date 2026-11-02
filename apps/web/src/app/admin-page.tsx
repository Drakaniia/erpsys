import AdminTabBar from "../components/admin/AdminTabBar";
import AdminReportsTab from "../components/admin/AdminReportsTab";
import AuditLogTable from "../components/admin/AuditLogTable";
import OverviewStats from "../components/admin/OverviewStats";
import FirstRunBanner from "../components/admin/FirstRunBanner";
import UserTable from "../components/admin/UserTable";
import PasswordManagement from "../components/admin/PasswordManagement";
import DepartmentTable from "../components/admin/DepartmentTable";
import AdviserMappingList from "../components/admin/AdviserMappingList";
import AcademicYearTable from "../components/admin/AcademicYearTable";
import RequirementList from "../components/admin/RequirementList";
import PageLoader from "../components/ui/PageLoader";
import ChatbotEditor from "../components/admin/ChatbotEditor";
import IntegrationsPanel from "../components/admin/IntegrationsPanel";
import StepUpHost from "../components/admin/StepUpHost";
import ShortcutsPopover from "../components/ui/ShortcutsPopover";
import ProfilingFormPanel from "../components/officer/ProfilingFormPanel";
import StudentsTab from "../components/instructor/StudentsTab";
import { useNavigate } from "react-router";
import { notify } from "$lib/notifications";
import {
  ADMIN_SHORTCUTS,
  useAdminConsole,
} from "./admin-page/use-admin-console";

export function AdminPage() {
  const {
    sessionQuery,
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
  } = useAdminConsole();
  const navigate = useNavigate();

  if (sessionQuery.isPending || !sessionQuery.data) {
    return <PageLoader label="Loading the admin console" />;
  }

  return (
    <div className="flex h-full flex-col">
      <AdminTabBar
        active={activeTab}
        hasActiveYear={hasActiveYear}
        onselect={selectTab}
      />

      <header className="mx-auto flex w-full max-w-[1440px] items-center justify-between gap-4 px-6 pb-2 pt-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{tabTitle}</h1>
        </div>
        <div className="relative flex items-center gap-3">
          {yearLabel && (
            <span className="text-sm text-muted tabular-nums">{yearLabel}</span>
          )}
          <button
            onClick={refreshActiveTab}
            aria-label={refreshing ? "Refreshing…" : "Refresh"}
            aria-busy={refreshing}
            disabled={refreshing}
            className="text-muted transition-[transform,color] duration-100 ease-out hover:text-ink active:scale-[0.97] disabled:opacity-60"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
              className={refreshing ? "animate-spin" : ""}
            >
              <path d="M21 12a9 9 0 1 1-2.64-6.36" />
              <path d="M21 3v6h-6" />
            </svg>
          </button>
          <button
            className="text-muted transition-[transform,color] duration-100 ease-out hover:text-ink active:scale-[0.97]"
            data-shortcuts-trigger
            aria-label="Keyboard shortcuts"
            aria-expanded={shortcutsOpen}
            onClick={() => setShortcutsOpen((prev) => !prev)}
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
          <ShortcutsPopover
            open={shortcutsOpen}
            onclose={() => setShortcutsOpen(false)}
            id="admin-shortcuts-popover"
            shortcuts={ADMIN_SHORTCUTS}
          />
        </div>
      </header>

      {!hasActiveYear && (
        <div className="mx-auto w-full max-w-[1440px] px-6 pb-3">
          <FirstRunBanner compact onactivate={goToYears} />
        </div>
      )}

      {/* Content */}
      <main className="mx-auto w-full max-w-[1440px] flex-1 overflow-y-auto px-6 pb-8">
        {activeTab === "overview" ? (
          <OverviewStats
            data={overviewQuery.data}
            onopenusers={openUsersFiltered}
            onopenyears={goToYears}
            onopenaudit={() => void selectTab("audit-log")}
            onopendepartments={() => void selectTab("departments")}
          />
        ) : activeTab === "users" ? (
          <UserTable
            q={searchQ}
            role={roleFilter}
            outside={outsideFilter}
            page={pageNum}
            pageSize={pageSize}
            onqchange={(q) => updateUrl({ q: q || null, page: null })}
            onrolechange={(r) =>
              updateUrl({ role: r === "ALL" ? null : r, page: null })
            }
            onoutsidechange={(o) =>
              updateUrl({ outside: o === "ALL" ? null : o, page: null })
            }
            onpagechange={(p) =>
              updateUrl({ page: p === 1 ? null : String(p) })
            }
            onpagesizechange={(n) =>
              updateUrl({ size: n === 50 ? null : String(n), page: null })
            }
            registerrefresh={(fn) => registerRefresh("users", fn)}
            ontoast={toast}
          />
        ) : activeTab === "students" ? (
          <StudentsTab
            defaultScope="all"
            ontoast={notify}
            onopenqueue={(departmentId) =>
              navigate(`/instructor?dept=${encodeURIComponent(departmentId)}`)
            }
          />
        ) : activeTab === "passwords" ? (
          <PasswordManagement
            ontoast={toast}
            registerrefresh={(fn) => registerRefresh("passwords", fn)}
          />
        ) : activeTab === "departments" ? (
          <DepartmentTable
            ontoast={toast}
            registerrefresh={(fn) => registerRefresh("departments", fn)}
          />
        ) : activeTab === "adviser-mapping" ? (
          <AdviserMappingList
            ontoast={toast}
            registerrefresh={(fn) => registerRefresh("adviser-mapping", fn)}
          />
        ) : activeTab === "academic-years" ? (
          <AcademicYearTable
            onyearactivated={() => {
              overviewQuery.refetch();
              profilingQuery.refetch();
            }}
            ontoast={toast}
            registerrefresh={(fn) => registerRefresh("academic-years", fn)}
          />
        ) : activeTab === "requirements" ? (
          <RequirementList
            ontoast={toast}
            registerrefresh={(fn) => registerRefresh("requirements", fn)}
          />
        ) : activeTab === "profiling-form" ? (
          <ProfilingFormPanel
            data={profilingQuery.data}
            hasActiveYear={hasActiveYear}
            onsave={handleSaveForm}
            onremove={handleRemoveForm}
            busy={saveFormMutation.isPending || removeFormMutation.isPending}
          />
        ) : activeTab === "chatbot" ? (
          <ChatbotEditor
            ontoast={toast}
            registerrefresh={(fn) => registerRefresh("chatbot", fn)}
            registerleaveguard={(fn) => registerLeaveGuard("chatbot", fn)}
          />
        ) : activeTab === "integrations" ? (
          <IntegrationsPanel
            registerrefresh={(fn) => registerRefresh("integrations", fn)}
          />
        ) : activeTab === "audit-log" ? (
          <AuditLogTable
            registerrefresh={(fn) => registerRefresh("audit-log", fn)}
          />
        ) : activeTab === "reports" ? (
          <AdminReportsTab
            activeYear={overviewQuery.data?.activeYear ?? null}
            loading={overviewQuery.isPending}
          />
        ) : null}
      </main>
      <StepUpHost />
    </div>
  );
}
