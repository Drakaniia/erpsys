const browser = typeof window !== "undefined";

const KEY_PREFIX = "erpsys:officer:read:";

function readSet(userId: string): Set<string> {
  if (!browser) return new Set();
  try {
    const raw = localStorage.getItem(`${KEY_PREFIX}${userId}`);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return new Set(
      Array.isArray(parsed)
        ? parsed.filter((x): x is string => typeof x === "string")
        : [],
    );
  } catch {
    return new Set();
  }
}

function writeSet(userId: string, ids: Set<string>) {
  if (!browser) return;
  try {
    localStorage.setItem(`${KEY_PREFIX}${userId}`, JSON.stringify([...ids]));
  } catch {}
}

export function isUnread(userId: string, verificationId: string): boolean {
  return !readSet(userId).has(verificationId);
}

export function markRead(userId: string, verificationId: string) {
  const set = readSet(userId);
  set.add(verificationId);
  writeSet(userId, set);
}
