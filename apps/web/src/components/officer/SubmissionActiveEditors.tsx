import { useEffect, useState } from "react";
import { api } from "$lib/api";
import { authClient } from "$lib/auth-client";

type Editor = { userId: string; name: string };

export default function SubmissionActiveEditors({ id }: { id: string }) {
  const [editors, setEditors] = useState<Editor[]>([]);
  const session = authClient.useSession();

  useEffect(() => {
    let stopped = false;
    let pending = false;
    let timer: ReturnType<typeof setTimeout>;

    async function refresh() {
      if (stopped || pending || document.hidden) return;
      pending = true;
      clearTimeout(timer);
      try {
        const result: Editor[] = await api.officer.getActiveEditors.call({
          id,
        });
        if (!stopped) setEditors(result);
      } catch {
        if (!stopped) setEditors([]);
      } finally {
        pending = false;
        if (!stopped) timer = setTimeout(refresh, 5000);
      }
    }

    void refresh();
    document.addEventListener("visibilitychange", refresh);
    return () => {
      stopped = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [id]);

  const names = editors.map((editor) => editor.name);
  return (
    <div role="status" className="shrink-0">
      {names.length > 0 && (
        <p className="border-b border-border bg-warning/10 px-5 py-2 text-sm text-ink">
          {editors.some(
            (editor) => editor.userId === session.data?.user.id,
          ) ? (
            "Your account is editing in another tab or session. Close that editor or wait for it to finish."
          ) : (
            <>
              <span className="font-medium">{names.join(", ")}</span> is
              editing. You can edit when they finish.
            </>
          )}
        </p>
      )}
    </div>
  );
}
