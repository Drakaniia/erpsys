import { useCallback, useEffect, useLayoutEffect, useMemo, useState, type ReactNode } from "react";
import { api } from "$lib/api";
import { cn } from "$lib/utils";
import { registerEditLease } from "$lib/edit-leases";

export type ActiveEditorsProps = {
  resource: string;
  id?: string;
  scope?: string;
  enabled?: boolean;
  className?: string;
  children?: ReactNode;
  onBlockedChange?: (blocked: boolean) => void;
};

type Editor = { userId: string; name: string; expiresAt: number | string };
type Target = { resource: string; id?: string; scope?: string; enabled: boolean };
const LEASE_MS = 30_000;

// One lease per target survives the dev StrictMode remount, so the second
// effect renews the first mount's lease instead of contending with itself.
const leases = new WeakMap<Target, string>();
const pendingReleases = new WeakMap<Target, ReturnType<typeof setTimeout>>();
function leaseFor(target: Target): string {
  let leaseId = leases.get(target);
  if (!leaseId) {
    leaseId = crypto.randomUUID();
    leases.set(target, leaseId);
  }
  return leaseId;
}

// Footer actions and table cells cannot always share the presence fieldset.
// Tag their state with the target so switching drafts fails closed immediately.
export function useEditingLock(target: unknown) {
  const [state, setState] = useState<{ target: unknown; blocked: boolean }>();
  const onBlockedChange = useCallback((blocked: boolean) => {
    setState((old) => old && old.target === target && old.blocked === blocked ? old : { target, blocked });
  }, [target]);
  return { blocked: !state || state.target !== target || state.blocked, onBlockedChange };
}

export default function ActiveEditors({
  resource, id, scope, enabled = true, className, children, onBlockedChange,
}: ActiveEditorsProps) {
  const target = useMemo(() => ({ resource, id, scope, enabled }), [resource, id, scope, enabled]);
  const [presence, setPresence] = useState<{
    target: typeof target;
    editors: Editor[];
    status: "ready" | "pending" | "unavailable";
    validUntil: number;
  }>();
  const [hidden, setHidden] = useState(() => document.hidden);
  const current = presence?.target === target ? presence : undefined;
  const blocked = enabled && (hidden || !current || current.status !== "ready" || current.editors.length > 0 || current.validUntil <= Date.now());

  useLayoutEffect(() => { onBlockedChange?.(blocked); }, [blocked, onBlockedChange]);

  useEffect(() => {
    if (!target.enabled) return;
    const input = {
      resource: target.resource,
      ...(target.id === undefined ? {} : { id: target.id }),
      ...(target.scope === undefined ? {} : { scope: target.scope }),
      leaseId: leaseFor(target),
    };
    clearTimeout(pendingReleases.get(target));
    const unregister = registerEditLease(input.leaseId);
    let stopped = false;
    let pending: Promise<void> | undefined;
    let timer: ReturnType<typeof setInterval> | undefined;
    let expiry: ReturnType<typeof setTimeout> | undefined;
    let generation = 0;
    let renewAfterPending = false;

    function invalidate() {
      clearTimeout(expiry);
      setPresence({ target, editors: [], status: "pending", validUntil: 0 });
    }
    function leave(): Promise<void> {
      return api.presence.leave.call(input).catch(() => { /* Abandoned leases expire. */ });
    }
    function heartbeat() {
      if (stopped || document.hidden || pending) return;
      const startedAt = Date.now();
      const requestGeneration = generation;
      pending = (async () => {
        try {
          const editors: Editor[] = await api.presence.touch.call(input);
          if (stopped || document.hidden || requestGeneration !== generation) return;
          const validUntil = startedAt + LEASE_MS;
          clearTimeout(expiry);
          setPresence({ target, editors, status: "ready", validUntil });
          expiry = setTimeout(invalidate, Math.max(0, validUntil - Date.now()));
        } catch {
          if (!stopped && requestGeneration === generation) {
            clearTimeout(expiry);
            setPresence({ target, editors: [], status: "unavailable", validUntil: 0 });
          }
        }
      })().finally(() => {
        pending = undefined;
        if (renewAfterPending) { renewAfterPending = false; heartbeat(); }
      });
    }
    function visibilityChanged() {
      generation++;
      clearInterval(timer);
      setHidden(document.hidden);
      invalidate();
      if (stopped || document.hidden) return;
      if (pending) renewAfterPending = true;
      else heartbeat();
      timer = setInterval(heartbeat, 5000);
    }
    document.addEventListener("visibilitychange", visibilityChanged);
    visibilityChanged();
    return () => {
      document.removeEventListener("visibilitychange", visibilityChanged);
      stopped = true;
      unregister();
      clearInterval(timer);
      clearTimeout(expiry);
      // Release one macrotask late so the StrictMode remount's setup cancels
      // it; complete a late POST before DELETE so it cannot resurrect a lease.
      pendingReleases.set(target, setTimeout(() => { if (pending) void pending.then(leave); else void leave(); }, 0));
    };
  }, [target]);

  const message = !enabled || !blocked ? null : hidden
    ? "Editing paused while this tab is hidden. Checking access when you return."
    : current?.status === "unavailable"
      ? "Editing unavailable. Reconnecting before you can edit."
      : current?.editors.length
        ? `${current.editors.map((editor) => editor.name).join(", ")} is editing. You can edit when they finish.`
        : "Checking editing access…";
  return <>
    {message && <span role="status" className={cn("block rounded-lg border border-warning/20 bg-warning/10 px-3 py-2 text-sm text-muted", className)}>{message}</span>}
    {children !== undefined && <fieldset disabled={blocked} className="min-w-0 space-y-3 border-0 p-0">{children}</fieldset>}
  </>;
}
