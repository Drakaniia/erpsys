import { authClient } from "$lib/auth-client";
import { sessionUserName } from "$lib/report/session";
import ReportsPanel from "../report/ReportsPanel";

export default function InstructorReportsTab({
  hasActiveYear,
  yearLabel,
  semesterLabel,
}: {
  hasActiveYear: boolean;
  yearLabel: string;
  semesterLabel: string;
}) {
  const sessionQuery = authClient.useSession();
  const userName = sessionUserName(sessionQuery.data);
  return (
    <ReportsPanel
      role="instructor"
      hasActiveYear={hasActiveYear}
      yearLabel={yearLabel}
      semester={semesterLabel}
      userName={userName}
    />
  );
}
