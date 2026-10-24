import type { ChatMessage, ChatSession } from "./types";

const STORAGE_KEY_PREFIX = "erpsys-chat-history-";
const MAX_MESSAGES = 50; // 25 turns

function storageKey(userId: string): string {
  return `${STORAGE_KEY_PREFIX}${userId}`;
}

function isSameDay(a: number, b: number): boolean {
  const da = new Date(a);
  const db = new Date(b);
  return (
    da.getFullYear() === db.getFullYear() &&
    da.getMonth() === db.getMonth() &&
    da.getDate() === db.getDate()
  );
}

export function loadSession(userId: string): ChatSession | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (!raw) return null;

    const session: ChatSession = JSON.parse(raw);
    if (!isSameDay(session.createdAt, Date.now())) return null;

    return session;
  } catch {
    return null;
  }
}

function saveSession(userId: string, session: ChatSession): void {
  if (typeof window === "undefined") return;

  const trimmed: ChatSession = {
    ...session,
    messages: session.messages.slice(-MAX_MESSAGES),
  };

  try {
    localStorage.setItem(storageKey(userId), JSON.stringify(trimmed));
  } catch {}
}

export function appendMessage(
  userId: string,
  message: ChatMessage,
): ChatSession {
  const existing = loadSession(userId) ?? {
    messages: [],
    createdAt: Date.now(),
  };
  const updated: ChatSession = {
    ...existing,
    messages: [...existing.messages, message],
  };
  saveSession(userId, updated);
  return updated;
}

/** Start a brand-new session (e.g. new day). */
export function newSession(): ChatSession {
  return { messages: [], createdAt: Date.now() };
}
