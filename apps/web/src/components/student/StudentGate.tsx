import OnboardingModal from "./OnboardingModal";
import type { MyStepsData } from "$lib/student/types";

export default function StudentGate({
  show,
  data,
  onclose,
}: {
  show: boolean;
  data: MyStepsData | undefined;
  onclose: () => void;
}) {
  if (!show || !data) return null;
  return <OnboardingModal data={data} mode="gate" onclose={onclose} />;
}
