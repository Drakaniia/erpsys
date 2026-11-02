import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import ConfirmDialog from "../ConfirmDialog";
import { renderMarkdown } from "$lib/chat/markdown";
import { api, queryClient } from "$lib/api";
import { relativeTime } from "$lib/officer/format";

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

  useEffect(() => {
    if (!loaded && docQuery.data) {
      setDraft(docQuery.data.content);
      setLoaded(true);
    }
  }, [loaded, docQuery.data]);

  const dirty = loaded && draft !== (docQuery.data?.content ?? "");
  const wordCount = draft.trim() ? draft.trim().split(/\s+/).length : 0;

  // The preview pane is browser-only anyway, and `renderMarkdown` escapes
  // rather than sanitises when DOMPurify has no DOM (SSR), so no extra guard.
  const safeRendered = useMemo(() => renderMarkdown(draft), [draft]);

  const [previewMode, setPreviewMode] = useState<"split" | "edit" | "preview">(
    "split",
  );
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 900px)");
    const update = () => setPreviewMode(mq.matches ? "split" : "edit");
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  // ---- Save ----
  async function save() {
    try {
      const res = await saveMutation.mutateAsync({ content: draft });
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
    setDraft(docQuery.data?.content ?? "");
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
            This markdown document grounds the chatbot — answers come strictly
            from it. Saving is live.
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
          disabled={!dirty || saveMutation.isPending}
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

      <div className="overflow-hidden rounded-xl border border-border bg-surface-raised">
        {previewMode === "edit" && (
          <div className="flex border-b border-border">
            <button
              onClick={() => setPreviewMode("edit")}
              className="px-4 py-2 text-sm font-medium text-primary transition-[transform,background-color] duration-100 ease-out active:scale-[0.97]"
              aria-current="true"
            >
              Edit
            </button>
            <button
              onClick={() => setPreviewMode("preview")}
              className="px-4 py-2 text-sm text-muted transition-[transform,background-color] duration-100 ease-out hover:text-ink active:scale-[0.97]"
            >
              Preview
            </button>
          </div>
        )}

        <div className={previewMode === "split" ? "grid grid-cols-2" : ""}>
          {previewMode !== "preview" && (
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.currentTarget.value)}
              aria-label="Knowledge document (markdown)"
              placeholder={"# Enrollment process\n\nDescribe the steps here…"}
              spellCheck={false}
              className={`h-[480px] w-full resize-y border-0 bg-surface-raised p-4 font-mono text-sm leading-relaxed text-ink placeholder:text-muted focus:outline-none ${
                previewMode === "split" ? "border-r border-border" : ""
              }`}
            />
          )}
          {previewMode !== "edit" && (
            <div
              className="prose-sm h-[480px] max-w-none overflow-y-auto p-4 text-sm leading-relaxed text-ink"
              aria-label="Preview"
            >
              {safeRendered ? (
                <div dangerouslySetInnerHTML={{ __html: safeRendered }} />
              ) : (
                <p className="text-muted">Nothing to preview yet.</p>
              )}
            </div>
          )}
        </div>
      </div>

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
