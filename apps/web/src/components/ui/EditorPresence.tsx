import type { useEditingPresence } from "$lib/editing-presence";

export default function EditorPresence({ presence }: { presence: ReturnType<typeof useEditingPresence> }) {
  const users = [...new Map(presence.editors.filter((e) => new Date(e.expiresAt).getTime() > Date.now()).map((e) => [e.userId, e])).values()];
  return <p role="status" aria-live="polite" className="text-xs text-muted">
    {presence.error ? "Editor status unavailable. Save conflict protection remains active." : users.length ? `${users.length} editing: ${users.map((e) => e.name).join(", ")}` : "No other editors reported."}
  </p>;
}
