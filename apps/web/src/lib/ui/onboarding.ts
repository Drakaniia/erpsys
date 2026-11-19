export type OnboardingTip = {
  id: string;
  title: string;
  body: string;
  context: string;
};

export function readSeenTips(key: string): Set<string> {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key) ?? "[]");
    if (Array.isArray(value)) {
      return new Set(value.filter((id): id is string => typeof id === "string"));
    }
  } catch {
    // Tips still work for this visit if storage is blocked or corrupted.
  }
  return new Set();
}

export function rememberTip(key: string, seen: Set<string>, id: string) {
  seen.add(id);
  try {
    localStorage.setItem(key, JSON.stringify([...readSeenTips(key), ...seen]));
  } catch {
    // Keep the in-memory record when persistent storage is unavailable.
  }
}
