import { useSyncExternalStore } from "react";

const prefix = "erpsys:notifications:read:";
const changed = "erpsys:notifications:read-changed";
const memory = new Map<string, string>();

function snapshot(userId: string): string {
  if (!userId) return "[]";
  try {
    return memory.get(userId) ?? localStorage.getItem(prefix + userId) ?? "[]";
  } catch {
    return memory.get(userId) ?? "[]";
  }
}

function readIds(value: string): Set<string> {
  try {
    const parsed: unknown = JSON.parse(value);
    return new Set(Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : []);
  } catch {
    return new Set();
  }
}

function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(changed, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(changed, callback);
  };
}

export function markNotificationsRead(userId: string, ids: string[]): void {
  if (!userId) return;
  const read = readIds(snapshot(userId));
  for (const id of ids) read.add(id);
  const value = JSON.stringify([...read].slice(-1000));
  try {
    localStorage.setItem(prefix + userId, value);
    memory.delete(userId);
  } catch {
    memory.set(userId, value);
  }
  window.dispatchEvent(new Event(changed));
}

export function useNotificationReadState<T extends { id: string; readAt?: string | null }>(userId: string, items: T[]) {
  const value = useSyncExternalStore(subscribe, () => snapshot(userId), () => "[]");
  const read = readIds(value);
  return {
    items: items.map((item) => ({ ...item, readAt: read.has(item.id) ? "local" : item.readAt })),
    markRead: () => markNotificationsRead(userId, items.map((item) => item.id)),
  };
}
