import { useEffect, useState } from "react";
import { api } from "$lib/api";

type Editor = { userId: string; name: string };

export default function SubmissionActiveEditors({
  id,
  userId,
  editing,
}: {
  id: string;
  userId: string;
  editing: boolean;
}) {
  const [editors, setEditors] = useState<Editor[]>([]);

  useEffect(() => {
    let stopped = false;
    let pending = false;
    let timer: ReturnType<typeof setTimeout>;

    async function refresh() {
      if (stopped || pending || document.hidden) return;
      pending = true;
      clearTimeout(timer);
      try {
        const route = editing
          ? api.officer.renewActiveEditor
          : api.officer.getActiveEditors;
        const result: Editor[] = await route.call({ id });
        if (!stopped) setEditors(result);
      } catch {
        if (!stopped) setEditors([]);
      } finally {
        pending = false;
        if (!stopped) timer = setTimeout(refresh, 10_000);
      }
    }

    void refresh();
    document.addEventListener("visibilitychange", refresh);
    return () => {
      stopped = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [id, editing]);

  const names = editors
    .filter((editor) => editor.userId !== userId)
    .map((editor) => editor.name);
  return (
    <div role="status" className="shrink-0">
      {names.length > 0 && (
        <p className="border-b border-border bg-warning/10 px-5 py-2 text-sm text-ink">
          Also editing: <span className="font-medium">{names.join(", ")}</span>
        </p>
      )}
    </div>
  );
}
