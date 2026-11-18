import { useEffect, useRef, useState } from "react";
import { api, recordTimestamp, timestampOf } from "$lib/api";

export type Editor = { userId: string; editorId: string; name: string; lastSeenAt: string; expiresAt: string };
export type Presence = { resource: string; recordId: string; editors: Editor[] };

export function useEditingPresence(resource: string, recordId: string | null | undefined, source?: unknown) {
  const [snapshot, setSnapshot] = useState<{ key: string; editors: Editor[] }>({ key: "", editors: [] });
  const [error, setError] = useState(false);
  const anchor = useRef<{ key: string; ts?: number }>({ key: "" });
  const key = recordId ? `${resource}:${recordId}` : "";
  if (anchor.current.key !== key) anchor.current = { key, ts: timestampOf(source) ?? (source ? 1 : recordId ? recordTimestamp(recordId) : undefined) };
  // A delayed initial query may supply the snapshot after the editor mounts.
  if (key && anchor.current.ts === undefined && timestampOf(source) !== undefined) anchor.current.ts = timestampOf(source);

  useEffect(() => {
    if (!recordId) { setSnapshot({ key: "", editors: [] }); setError(false); return; }
    const editorId = crypto.randomUUID();
    const input = { resource, recordId, editorId };
    let stopped = false;
    let pending: Promise<unknown> = Promise.resolve();
    let running = false;
    async function heartbeat() {
      if (running || stopped) return;
      running = true;
      try {
        const result = await api.editingPresence.join.call(input) as Presence;
        if (!result || !Array.isArray(result.editors)) throw new Error("Invalid editor presence response");
        if (!stopped) { setSnapshot({ key: `${resource}:${recordId}`, editors: result.editors }); setError(false); }
      } catch { if (!stopped) setError(true); }
      finally { running = false; }
    }
    const renew = () => { if (!running && !stopped) pending = heartbeat(); };
    renew();
    const interval = window.setInterval(renew, 20_000);
    const focus = () => renew();
    window.addEventListener("focus", focus);
    const leave = () => { void pending.finally(() => api.editingPresence.leave.call(input)).catch(() => {}); };
    window.addEventListener("pagehide", leave);
    return () => {
      stopped = true;
      clearInterval(interval);
      window.removeEventListener("focus", focus);
      window.removeEventListener("pagehide", leave);
      leave();
    };
  }, [resource, recordId]);
  return { editors: recordId && snapshot.key === key ? snapshot.editors : [], error: Boolean(recordId) && error, ts: anchor.current.ts,
    saved: (result: unknown) => { anchor.current.ts = timestampOf(result) ?? anchor.current.ts; },
  };
}
