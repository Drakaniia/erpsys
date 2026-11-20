import { useEffect, useMemo, useRef, useState } from "react";
import { useEditTimestamp } from "$lib/edit-timestamp";
import { useMutation, useQuery } from "@tanstack/react-query";
import ConfirmDialog from "../ConfirmDialog";
import ActiveEditors, { useEditingLock } from "../ActiveEditors";
import { renderMarkdown } from "$lib/chat/markdown";
import { api, queryClient } from "$lib/api";
import { relativeTime } from "$lib/officer/format";
import KnowledgeEditor from "./KnowledgeEditor";

export default function ChatbotEditor({
  ontoast,
  registerrefresh = () => {},
  registerleaveguard = () => {},
}: {
  ontoast: (message: string, kind?: "success" | "error") => void;
  registerrefresh?: (fn: () => Promise<unknown> | void) => void;
  registerleaveguard?: (fn: () => Promise<boolean>) => void;
}) {
  // ---- Query ----
  const docQuery = useQuery(
    api.admin.getChatbotKnowledge.queryOptions({ refetchOnWindowFocus: true }),
  );
  const { refetch } = docQuery;
  useEffect(() => {
    registerrefresh(() => refetch());
  }, [registerrefresh, refetch]);

  const saveMutation = useMutation(
    api.admin.updateChatbotKnowledge.mutationOptions(),
  );

  // ---- Editor state ----
  const [draft, setDraft] = useState("");
  const [loaded, setLoaded] = useState(false);
  const lock = useEditingLock(loaded);
  const [savedContent, setSavedContent] = useState("");

  useEffect(() => {
    if (!loaded && docQuery.isSuccess) {
      const content = docQuery.data?.content ?? "";
      setDraft(content);
      setSavedContent(content);
      setLoaded(true);
    }
  }, [loaded, docQuery.data, docQuery.isSuccess]);

  const presence = useEditTimestamp(
    "chatbot-knowledge",
    docQuery.isSuccess ? "default" : null,
    docQuery.data,
  );
  const dirty = loaded && draft !== savedContent;
  const wordCount = useMemo(() => {
    const text = document.createElement("div");
    text.innerHTML = renderMarkdown(draft).replace(/<[^>]+>/g, " ");
    return text.textContent?.trim().split(/\s+/).filter(Boolean).length ?? 0;
  }, [draft]);

  // ---- Save ----
  async function save() {
    try {
      const res = await saveMutation.mutateAsync({
        content: draft,
        ts: presence.ts,
      });
      presence.saved(res);
      setSavedContent(draft);
      ontoast(`Saved — version ${res.version}`);
      queryClient.invalidateQueries({ queryKey: ["admin"] });
    } catch (e) {
      ontoast(
        e instanceof Error ? e.message : "Could not save the document",
        "error",
      );
    }
  }

  // ---- Unsaved-changes guard (§6.8) ----
  const [leaving, setLeaving] = useState(false);
  const resolveLeave = useRef<((ok: boolean) => void) | null>(null);

  const confirmLeave = useRef(async (): Promise<boolean> => {
    if (!dirty) return true;
    return new Promise<boolean>((resolve) => {
      resolveLeave.current = resolve;
      setLeaving(true);
    });
  });
  confirmLeave.current = async (): Promise<boolean> => {
    if (!dirty) return true;
    return new Promise<boolean>((resolve) => {
      resolveLeave.current = resolve;
      setLeaving(true);
    });
  };

  function ondiscard() {
    const content = docQuery.data?.content ?? "";
    setDraft(content);
    setSavedContent(content);
    setLeaving(false);
    resolveLeave.current?.(true);
    resolveLeave.current = null;
  }

  function oncancelLeave() {
    setLeaving(false);
    resolveLeave.current?.(false);
    resolveLeave.current = null;
  }

  useEffect(() => {
    registerleaveguard(() => confirmLeave.current());
  }, [registerleaveguard]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-0.5">
          <p className="text-sm text-muted">
            This document grounds the chatbot — answers come strictly from it.
            Use the toolbar to format your content. Saving is live.
          </p>
          <p className="text-xs text-muted">
            {docQuery.data?.updatedByName
              ? `Last updated by ${docQuery.data.updatedByName}`
              : null}
            {docQuery.data?.updatedAt
              ? ` · ${relativeTime(docQuery.data.updatedAt)}`
              : null}
            {` · version ${docQuery.data?.version ?? "—"}`}
            {wordCount > 0 ? ` · ${wordCount.toLocaleString()} words` : null}
          </p>
        </div>
        <button
          onClick={save}
          disabled={lock.blocked || !loaded || !dirty || saveMutation.isPending}
          className="shrink-0 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition-[transform,background-color] duration-100 ease-out active:scale-[0.97] disabled:opacity-40"
        >
          {saveMutation.isPending
            ? "Saving…"
            : dirty
              ? "Save (unsaved)"
              : "Save"}
        </button>
      </div>

      {docQuery.isError && (
        <div className="flex items-center justify-between gap-4 rounded-lg border border-error/30 bg-error/5 px-4 py-3">
          <p className="text-sm text-error">
            Could not load the knowledge document.
          </p>
          <button
            onClick={() => docQuery.refetch()}
            className="rounded-lg border border-error/30 px-3 py-1.5 text-sm text-error transition-[transform,background-color] duration-100 ease-out hover:bg-error/5 active:scale-[0.97]"
          >
            Retry
          </button>
        </div>
      )}

      <ActiveEditors resource="chatbot-knowledge" enabled={loaded} onBlockedChange={lock.onBlockedChange}>
        <KnowledgeEditor value={draft} onChange={setDraft} disabled={lock.blocked || !loaded} />
      </ActiveEditors>

      <ConfirmDialog
        open={leaving}
        title="Discard unsaved changes?"
        body="Your edits to the knowledge document haven't been saved."
        confirmLabel="Discard"
        destructive
        onconfirm={ondiscard}
        onclose={oncancelLeave}
      />
    </div>
  );
}
