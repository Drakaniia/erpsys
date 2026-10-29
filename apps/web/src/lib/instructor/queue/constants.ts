export const IDLE_PROMPT_MS = 55 * 60 * 1000;
export const HEARTBEAT_THROTTLE_MS = 60 * 1000;
export const AUTO_CLOSE_NOTICE_WINDOW_MS = 24 * 60 * 60 * 1000;

export type Toast = (
  msg: string,
  kind?: "success" | "error" | "warning",
) => void;
