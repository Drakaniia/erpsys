import { normalizeOverview } from "$lib/officer/overview";
import type { OfficerTab } from "$lib/officer/tabs";
import type { OverviewData } from "$lib/officer/types";
import EmptyState from "../ui/EmptyState";
import { ClearanceRings } from "./overview/ClearanceRings";
import { DecisionLog } from "./overview/DecisionLog";
import { Hero } from "./overview/Hero";
import { ReviewPace } from "./overview/ReviewPace";
import { StepDesk } from "./overview/StepDesk";
import "./overview/overview.css";

/**
 * The officer's front desk: what is waiting, where to start, and whether
 * review is keeping pace with what students submit.
 */
export default function StepOverview({
  data,
  isLoading = false,
  onopenstep,
}: {
  data: OverviewData | undefined;
  isLoading?: boolean;
  onopenstep: (tab: OfficerTab) => void;
}) {
  const model = normalizeOverview(data);

  if (!model && !isLoading) {
    return (
      <EmptyState
        title="The overview didn't load"
        hint="Check your connection. The page retries on its own every 20 seconds."
        icon="inbox"
      />
    );
  }

  if (model && !model.hasActiveYear) {
    return (
      <EmptyState
        title="No active academic year"
        hint="An admin must activate one before students can submit steps."
        icon="calendar"
      />
    );
  }

  return (
    <div className="flex flex-col gap-6 pb-6" aria-busy={!model}>
      <Hero model={model} onopenstep={onopenstep} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="flex min-w-0 lg:col-span-7">
          <StepDesk model={model} index={2} onopenstep={onopenstep} />
        </div>
        <div className="flex min-w-0 lg:col-span-5">
          <ClearanceRings model={model} index={3} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="flex min-w-0 lg:col-span-8">
          <ReviewPace model={model} index={4} />
        </div>
        <div className="flex min-w-0 lg:col-span-4">
          <DecisionLog model={model} index={5} />
        </div>
      </div>
    </div>
  );
}
