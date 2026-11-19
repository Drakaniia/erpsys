import { useRef } from "react";
import { recordTimestamp, timestampOf } from "$lib/api";

export function useEditTimestamp(
  resource: string,
  recordId: string | null | undefined,
  source?: unknown,
) {
  const anchor = useRef<{ key: string; ts?: number }>({ key: "" });
  const key = recordId ? `${resource}:${recordId}` : "";
  if (anchor.current.key !== key) {
    anchor.current = {
      key,
      ts:
        timestampOf(source) ??
        (source ? 1 : recordId ? recordTimestamp(recordId) : undefined),
    };
  }
  // A delayed initial query may supply the snapshot after the editor mounts.
  if (
    key &&
    anchor.current.ts === undefined &&
    timestampOf(source) !== undefined
  )
    anchor.current.ts = timestampOf(source);
  return {
    ts: anchor.current.ts,
    saved: (result: unknown) => {
      anchor.current.ts = timestampOf(result) ?? anchor.current.ts;
    },
  };
}
