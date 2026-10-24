import { toast as sonnerToast } from "sonner";

export type NotifyKind = "success" | "error" | "warning" | "info";

function haptic(kind: NotifyKind) {
  if (typeof navigator === "undefined" || !("vibrate" in navigator)) return;
  try {
    if (kind === "error") navigator.vibrate(40);
    else if (kind === "success") navigator.vibrate(12);
  } catch {
    /* vibrate blocked */
  }
}

function emit(message: string, kind: NotifyKind = "success") {
  if (kind === "success" || kind === "error") haptic(kind);

  switch (kind) {
    case "error":
      sonnerToast.error(message);
      break;
    case "warning":
      if (
        typeof (sonnerToast as unknown as { warning?: (m: string) => void })
          .warning === "function"
      ) {
        (sonnerToast as unknown as { warning: (m: string) => void }).warning(
          message,
        );
      } else {
        sonnerToast(message);
      }
      break;
    case "info":
      if (
        typeof (sonnerToast as unknown as { info?: (m: string) => void })
          .info === "function"
      ) {
        (sonnerToast as unknown as { info: (m: string) => void }).info(message);
      } else {
        sonnerToast(message);
      }
      break;
    default:
      sonnerToast.success(message);
  }
}

export const notify = Object.assign(
  (message: string, kind: NotifyKind = "success") => emit(message, kind),
  {
    success: (m: string) => emit(m, "success"),
    error: (m: string) => emit(m, "error"),
    warning: (m: string) => emit(m, "warning"),
    info: (m: string) => emit(m, "info"),
    dismiss: (id?: string | number) => sonnerToast.dismiss(id),
  },
);
