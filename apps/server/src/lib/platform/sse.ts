const LIVE_TOPICS = [
  "transfer-requests",
  "notifications",
  "queue",
  "availability",
  "reconnect",
] as const;

export type LiveTopic = (typeof LIVE_TOPICS)[number];

export type LiveEvent = {
  topic: LiveTopic;
  at: string;
};

type Listener = (event: LiveEvent) => void;

const listenersByUser = new Map<string, Set<Listener>>();

export function subscribeToUser(
  userId: string,
  listener: Listener,
): () => void {
  let listeners = listenersByUser.get(userId);
  if (!listeners) {
    listeners = new Set();
    listenersByUser.set(userId, listeners);
  }
  listeners.add(listener);

  return () => {
    const current = listenersByUser.get(userId);
    if (!current) return;
    current.delete(listener);
    if (current.size === 0) listenersByUser.delete(userId);
  };
}

export function publishToUser(
  userId: string,
  topic: LiveTopic,
  now: Date = new Date(),
): void {
  const listeners = listenersByUser.get(userId);
  if (!listeners) return;

  const event: LiveEvent = { topic, at: now.toISOString() };
  for (const listener of [...listeners]) {
    try {
      listener(event);
    } catch {}
  }
}

export function publishToAll(topic: LiveTopic, now: Date = new Date()): void {
  const event: LiveEvent = { topic, at: now.toISOString() };
  for (const listeners of [...listenersByUser.values()]) {
    for (const listener of [...listeners]) {
      try {
        listener(event);
      } catch {}
    }
  }
}

export function totalSubscriberCount(): number {
  let total = 0;
  for (const listeners of listenersByUser.values()) total += listeners.size;
  return total;
}
