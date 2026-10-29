import { useEffect, useState } from "react";
import {
  registerStepUpHost,
  type StepUpWaiter,
} from "$lib/auth/step-up";
import StepUpDialog from "./StepUpDialog";

/** Mounted once in the admin console; opens the confirmation when the API asks for it. */
export default function StepUpHost() {
  const [waiter, setWaiter] = useState<StepUpWaiter | null>(null);

  useEffect(() => {
    registerStepUpHost((next) => setWaiter(next));
    return () => registerStepUpHost(null);
  }, []);

  if (!waiter) return null;
  return (
    <StepUpDialog
      onDone={() => {
        waiter.ok();
        setWaiter(null);
      }}
      onCancel={() => {
        waiter.cancel();
        setWaiter(null);
      }}
    />
  );
}
