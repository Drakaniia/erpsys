import { AsyncLocalStorage } from "node:async_hooks";

const tasks = new AsyncLocalStorage<Set<Promise<unknown>>>();

export function background(task: Promise<unknown>): void {
  const pending = tasks.getStore();
  if (!pending) return;
  pending.add(task);
  void task.finally(() => pending.delete(task)).catch(() => {});
}

export function withBackgroundTasks<T>(pending: Set<Promise<unknown>>, run: () => T): T {
  return tasks.run(pending, run);
}

export async function drainBackgroundTasks(pending: Set<Promise<unknown>>): Promise<void> {
  while (pending.size) await Promise.allSettled([...pending]);
}
