export * from "./models";
import {
  useInstructorState as useFilmInstructorState,
  useOfficerState as useFilmOfficerState,
} from "./models";
import { useScene } from "./session";
import { overview, ago, people } from "./records";

const noop = () => {};
const idle = {
  isPending: false,
  isFetching: false,
  isError: false,
  refetch: noop,
};
const officerOverview = {
  hasActiveYear: true,
  students: { started: 208, cleared: 142 },
  steps: overview.stepTotals.map((step, i) => ({
    ...step,
    awaitingReview: step.unverified - 2,
    returned: 2,
    oldestAwaitingAt: ago(45 + i * 15),
  })),
  reviewTrend: overview.queueTrend.map((day, i) => ({
    day: day.day,
    submitted: day.joined * 3,
    verified: day.completed * 3,
    returned: (i % 3) + 1,
  })),
  recentActivity: people
    .slice(0, 4)
    .map((student, i) => ({
      id: `decision-${i}`,
      studentName: student.name,
      stepCode: "PROFILING",
      action: i === 2 ? "RETURNED" : "VERIFIED",
      at: ago(i * 7 + 1),
    })),
};
export function useOfficerState() {
  const state = useFilmOfficerState();
  const { frame } = useScene();
  return frame >= 200
    ? {
        ...state,
        activeTab: "overview",
        detailId: null,
        overviewQuery: { ...idle, data: officerOverview },
        selectTab: noop,
      }
    : state;
}

export function useInstructorState() {
  const state = useFilmInstructorState();
  return {
    ...state,
    queue: {
      ...state.queue,
      queueQuery: idle,
      waitingEntries: state.queue.activeDept.entries,
      refreshQueues: noop,
      setStillThereOpen: noop,
      guideStep: 1,
      guideDontShow: true,
    },
    enrolled: { ...state.enrolled, hasMore: false },
  };
}
