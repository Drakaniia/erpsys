import { authClient } from "$lib/auth-client";
import { sessionUserName } from "$lib/report/session";
import PageLoader from "../ui/PageLoader";
import ReportsPanel from "../report/ReportsPanel";

export default function OfficerReportsTab({
  hasActiveYear,
  yearLabel,
  loading = false,
}: {
  hasActiveYear: boolean;
  yearLabel: string | null;
  loading?: boolean;
}) {
  const sessionQuery = authClient.useSession();
  const userName = sessionUserName(sessionQuery.data);
  if (loading && !hasActiveYear) {
    return <PageLoader label="Loading the active academic year" />;
  }
  const yearParts = (yearLabel ?? "").split(" · ");
  const ayLabel = yearParts[0] ?? "";
  const semester = yearParts.slice(1).join(" · ");
  return (
    <ReportsPanel
      role="officer"
      hasActiveYear={hasActiveYear}
      yearLabel={ayLabel}
      semester={semester}
      userName={userName}
    />
  );
}
