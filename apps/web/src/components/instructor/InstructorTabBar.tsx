import { useEffect, useRef, useState } from "react";
import { departmentLevelRangeLabel } from "$lib/domain/constants";
import { STUDENTS_TAB_ID } from "$lib/instructor/students";
import { REPORTS_TAB_ID } from "$lib/instructor/reports";
import type { DepartmentQueue } from "$lib/instructor/types";

const MANAGE_ID = "manage";

// ponytail: badge pop + tab-appear spring animations dropped — settled DOM
// identical. Add when motion polish matters (see AppleSwitch useSpring).
export default function InstructorTabBar({
  departments,
  activeId,
  onselect,
}: {
  departments: Array<
    Pick<
      DepartmentQueue,
      "id" | "name" | "code" | "waitingCount" | "yearLevels" | "myYearLevels"
    >
  >;
  activeId: string | null;
  onselect: (tabId: string) => void;
}) {
  const deptTabs = departments.map((d) => ({
    id: d.id,
    label: d.code,
    range: departmentLevelRangeLabel(
      d.myYearLevels.length > 0 ? d.myYearLevels : d.yearLevels,
    ),
    waitingCount: d.waitingCount,
  }));
  const hasDept = deptTabs.length > 0;
  const tabs = [
    { id: STUDENTS_TAB_ID, label: "Students", waitingCount: 0 },
    { id: REPORTS_TAB_ID, label: "Reports", waitingCount: 0 },
    ...deptTabs,
    { id: MANAGE_ID, label: "Manage", waitingCount: 0 },
  ];
  const manageSelected = activeId === MANAGE_ID;
  const studentsSelected = activeId === STUDENTS_TAB_ID;
  const reportsSelected = activeId === REPORTS_TAB_ID;

  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [focusedId, setFocusedId] = useState<string | null>(null);

  useEffect(() => {
    if (focusedId) tabRefs.current[focusedId]?.focus();
  }, [focusedId]);

  function onTabKeydown(event: React.KeyboardEvent, tabId: string) {
    const index = tabs.findIndex((t) => t.id === tabId);
    const count = tabs.length;
    let next: number;
    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        next = (index + 1) % count;
        break;
      case "ArrowLeft":
      case "ArrowUp":
        next = (index - 1 + count) % count;
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = count - 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    const target = tabs[next];
    if (!target) return;
    onselect(target.id);
    setFocusedId(target.id);
  }

  const pill = (selected: boolean, selectedCls: string, idleCls: string) =>
    `press transition-[transform,background-color,color,border-color] duration-100 ease-out ${selected ? selectedCls : idleCls}`;

  return (
    <nav
      aria-label="Departments"
      className="material sticky top-0 z-30 bg-chrome backdrop-blur-md"
    >
      <div className="mx-auto flex w-full max-w-[1200px] items-center gap-3 px-6 py-2">
        <div
          role="tablist"
          aria-orientation="horizontal"
          aria-label="Roster"
          className="flex shrink-0 items-center gap-1"
        >
          <button
            type="button"
            role="tab"
            id={`instructor-tab-${STUDENTS_TAB_ID}`}
            aria-selected={studentsSelected}
            aria-controls={`instructor-tabpanel-${STUDENTS_TAB_ID}`}
            tabIndex={studentsSelected ? 0 : -1}
            ref={(el) => {
              tabRefs.current[STUDENTS_TAB_ID] = el;
            }}
            onClick={() => onselect(STUDENTS_TAB_ID)}
            onKeyDown={(e) => onTabKeydown(e, STUDENTS_TAB_ID)}
            className={`students-pill group inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium ${pill(studentsSelected, "border border-primary/25 bg-primary/[0.08] text-primary", "border border-border text-ink/70 hover:bg-ink/[0.03] hover:text-ink")}`}
          >
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              aria-hidden="true"
            >
              <path
                d="M16 20v-1.5a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4V20"
                strokeLinecap="round"
              />
              <circle cx="9.5" cy="7.5" r="3.5" />
              <path
                d="M17 4.5a3.5 3.5 0 0 1 0 7M21 20v-1.5a4 4 0 0 0-3-3.87"
                strokeLinecap="round"
              />
            </svg>
            <span>Students</span>
          </button>
          <button
            type="button"
            role="tab"
            id={`instructor-tab-${REPORTS_TAB_ID}`}
            aria-selected={reportsSelected}
            aria-controls={`instructor-tabpanel-${REPORTS_TAB_ID}`}
            tabIndex={reportsSelected ? 0 : -1}
            ref={(el) => {
              tabRefs.current[REPORTS_TAB_ID] = el;
            }}
            onClick={() => onselect(REPORTS_TAB_ID)}
            onKeyDown={(e) => onTabKeydown(e, REPORTS_TAB_ID)}
            className={`students-pill group inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium ${pill(reportsSelected, "border border-primary/25 bg-primary/[0.08] text-primary", "border border-border text-ink/70 hover:bg-ink/[0.03] hover:text-ink")}`}
          >
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              aria-hidden="true"
            >
              <path
                d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M14 3v5h5M9 13h6M9 17h4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span>Reports</span>
          </button>
        </div>
        <div className="flex shrink-0 items-center gap-2" aria-hidden="true">
          <div className="h-5 w-px bg-border/40" />
          <span className="hidden text-[10px] font-medium uppercase tracking-[0.14em] text-muted/60 lg:inline">
            Departments
          </span>
        </div>
        <div
          role="tablist"
          aria-orientation="horizontal"
          aria-label="Your department"
          className="flex min-w-0 flex-1 items-center gap-1"
        >
          {deptTabs.map((tab) => {
            const selected = activeId === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                id={`instructor-tab-${tab.id}`}
                aria-selected={selected}
                aria-controls={`instructor-tabpanel-${tab.id}`}
                tabIndex={selected ? 0 : -1}
                ref={(el) => {
                  tabRefs.current[tab.id] = el;
                }}
                onClick={() => onselect(tab.id)}
                onKeyDown={(e) => onTabKeydown(e, tab.id)}
                className={`dept-pill group relative rounded-full px-4 py-1.5 text-sm font-medium ${pill(selected, "bg-primary text-white shadow-sm", "text-ink/70 hover:bg-ink/[0.04] hover:text-ink")}`}
              >
                <span className="truncate">{tab.label}</span>
                <span className="hidden truncate text-[11px] font-normal opacity-70 xl:inline">
                  · {tab.range}
                </span>
                {tab.waitingCount > 0 && (
                  <span
                    aria-hidden="true"
                    className={`absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold tabular-nums ${selected ? "bg-surface text-primary shadow-sm" : "bg-primary text-white"}`}
                  >
                    {tab.waitingCount > 99 ? "99+" : tab.waitingCount}
                  </span>
                )}
              </button>
            );
          })}
          {!hasDept && (
            <span
              className="hidden text-xs text-ink/35 sm:inline"
              aria-hidden="true"
            >
              No department assigned
            </span>
          )}
        </div>
        {hasDept && (
          <div aria-hidden="true" className="h-5 w-px shrink-0 bg-border/40" />
        )}
        <div
          role="tablist"
          aria-orientation="horizontal"
          aria-label="Management"
          className="flex shrink-0 items-center"
        >
          <button
            type="button"
            role="tab"
            id={`instructor-tab-${MANAGE_ID}`}
            aria-selected={manageSelected}
            aria-controls={`instructor-tabpanel-${MANAGE_ID}`}
            tabIndex={manageSelected ? 0 : -1}
            ref={(el) => {
              tabRefs.current[MANAGE_ID] = el;
            }}
            onClick={() => onselect(MANAGE_ID)}
            onKeyDown={(e) => onTabKeydown(e, MANAGE_ID)}
            className={`manage-pill relative rounded-full px-4 py-1.5 text-sm font-medium ${pill(manageSelected, "bg-surface-raised text-ink border border-border shadow-sm", "border border-border text-ink/55 hover:border-border/80 hover:bg-ink/[0.03] hover:text-ink")}`}
          >
            Manage
          </button>
        </div>
      </div>
    </nav>
  );
}
