import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import EditorPresence from "./EditorPresence";
afterEach(cleanup);
it("shows two users, groups duplicate tabs, and hides expired entries", () => {
  const future = new Date(Date.now() + 60_000).toISOString();
  const editor = (userId: string, name: string, editorId: string, expiresAt = future) => ({ userId, name, editorId, expiresAt, lastSeenAt: future });
  render(<EditorPresence presence={{ editors: [editor("a", "Alice", "1"), editor("a", "Alice", "2"), editor("b", "Bob", "3"), editor("c", "Expired", "4", new Date(0).toISOString())], error: false, ts: 10, saved: () => {} }} />);
  expect(screen.getByRole("status").textContent).toBe("2 editing: Alice, Bob");
});
