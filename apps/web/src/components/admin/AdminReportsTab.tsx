import { authClient } from "$lib/auth-client";
import { sessionUserName } from "$lib/report/session";
import PageLoader from "../ui/PageLoader";
import ReportsPanel from "../report/ReportsPanel";
export default function AdminReportsTab({
  activeYear,
  loading = false,
}: {
  activeYear: { id: string; label: string; semesterLabel: string } | null;
  loading?: boolean;
}) {
  const sessionQuery = authClient.useSession();
  const userName = sessionUserName(sessionQuery.data);
  if (loading && !activeYear) {
    return <PageLoader label="Loading the active academic year" />;
  }
  const hasActiveYear = activeYear !== null && activeYear !== undefined;

  return (
    <ReportsPanel
      role="admin"
      hasActiveYear={hasActiveYear}
      yearLabel={activeYear?.label ?? ""}
      semester={activeYear?.semesterLabel ?? ""}
      userName={userName}
    />
  );
}
