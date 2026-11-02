import { useEffect, useRef, useState } from "react";
import { HEARTBEAT_THROTTLE_MS } from "./constants";

const ACTIVITY_KEY = "instructor-last-activity";

/**
 * Idle tracking + heartbeat throttling. Refs, not state: these tick on every
 * pointer event and nothing renders them. Activity is shared across tabs via
 * localStorage so an idle second tab doesn't nag while you work in another.
 */
export function useIdleHeartbeat({
  anyDeptOpen,
  sendHeartbeat,
}: {
  anyDeptOpen: () => boolean;
  sendHeartbeat: () => Promise<unknown>;
}) {
  const lastInteractionAt = useRef(Date.now());
  const lastHeartbeatAt = useRef(0);
  const [stillThereOpen, setStillThereOpen] = useState(false);

  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key !== ACTIVITY_KEY || !e.newValue) return;
      lastInteractionAt.current = Math.max(
        lastInteractionAt.current,
        Number(e.newValue) || 0,
      );
      setStillThereOpen(false);
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  // Activity never closes "Still there?" by itself — only its buttons do, so
  // a press on "Close queue" can't be swallowed by the dialog fading out.
  function noteActivity() {
    const now = Date.now();
    lastInteractionAt.current = now;
    try {
      localStorage.setItem(ACTIVITY_KEY, String(now));
    } catch {
      /* storage unavailable */
    }
    if (
      anyDeptOpen() &&
      now - lastHeartbeatAt.current >= HEARTBEAT_THROTTLE_MS
    ) {
      lastHeartbeatAt.current = now;
      sendHeartbeat().catch(() => {
        lastHeartbeatAt.current = 0; // retry on the next activity
      });
    }
  }

  function answerStillThere() {
    lastHeartbeatAt.current = 0;
    setStillThereOpen(false);
    noteActivity();
  }

  return {
    lastInteractionAt,
    stillThereOpen,
    setStillThereOpen,
    noteActivity,
    answerStillThere,
  };
}
