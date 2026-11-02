import { useInstructorState } from "./state";
import { REPORTS_TAB_ID } from "./reports";
import InstructorTabBar from "../../components/instructor/InstructorTabBar";

export default function TabNavHarness() {
  const s = useInstructorState();
  const activeId = s.reportsSelected
    ? REPORTS_TAB_ID
    : s.studentsSelected
      ? "students"
      : s.activeDeptId;
  const view = s.reportsSelected
    ? "reports"
    : s.studentsSelected
      ? "students"
      : s.activeDeptId;

  return (
    <>
      <InstructorTabBar
        departments={s.queue.departments}
        activeId={activeId}
        onselect={(id) => {
          if (id === "students") s.selectStudentsTab();
          else if (id === REPORTS_TAB_ID) s.selectReportsTab();
          else s.selectTab(id);
        }}
      />
      <p data-testid="view">{view}</p>
    </>
  );
}
