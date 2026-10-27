import { useCallback, useState } from "react";
import { useIntegrations } from "$lib/integrations/use-integrations";
import { absoluteTime } from "$lib/officer/format";
import { useFormEditorWindow } from "$lib/officer/form-editor-window";
import ConfirmDialog from "../ConfirmDialog";
import EmptyState from "../ui/EmptyState";
import FormPreviewFullscreen, {
  embeddedFormUrl,
} from "./FormPreviewFullscreen";
import { ProfilingFormSkeleton } from "./SkeletonRows";

type ProfilingForm = {
  title?: string;
  responderUri?: string;
  editUrl?: string;
  updatedByName?: string | null;
  updatedAt?: string | null;
};

const linkCls =
  "rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-ink hover:bg-surface";

export default function ProfilingFormPanel({
  data,
  isLoading = false,
  hasActiveYear,
  onsave,
  onremove,
  busy,
}: {
  data: ProfilingForm | null | undefined;
  isLoading?: boolean;
  hasActiveYear: boolean;
  onsave: (title: string) => void;
  onremove: () => void;
  busy: boolean;
}) {
  const [title, setTitle] = useState("Student Profiling Form");
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const closeFullscreen = useCallback(() => setFullscreen(false), []);
  const { flags } = useIntegrations();
  const formsEnabled = flags.googleForms;
  const editor = useFormEditorWindow(data?.editUrl);

  if (isLoading && !data) return <ProfilingFormSkeleton />;
  if (!hasActiveYear) {
    return (
      <EmptyState
        title="Requires an active academic year"
        hint="Profiling is tied to a year — an admin must activate one first."
        icon="calendar"
      />
    );
  }

  if (!data?.editUrl && !formsEnabled) {
    return (
      <EmptyState
        title="Google Forms is turned off"
        hint="An admin can turn it back on under Integrations to create the profiling form."
        icon="form"
      />
    );
  }

  if (!data?.editUrl) {
    return (
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (title.trim()) onsave(title.trim());
        }}
      >
        <EmptyState
          title="No profiling form yet"
          hint="Create a Google Form, then add the questions in Google Forms. Students answer it signed in with their school Google account."
          icon="form"
        />
        <div className="flex flex-wrap gap-2">
          <input
            aria-label="Form title"
            className="min-w-0 flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink"
            maxLength={200}
            value={title}
            onChange={(e) => setTitle(e.currentTarget.value)}
          />
          <button
            type="submit"
            disabled={busy || !title.trim()}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {busy ? "Creating…" : "Create Google Form"}
          </button>
        </div>
      </form>
    );
  }

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-border bg-surface-raised p-4">
      <div>
        <p className="text-[15px] font-semibold text-ink">{data.title}</p>
        <p className="text-xs text-muted">
          {data.updatedByName ? `Created by ${data.updatedByName}` : "Linked"}
          {data.updatedAt ? ` · ${absoluteTime(data.updatedAt)}` : null}
        </p>
      </div>
      {!formsEnabled ? (
        <p className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink">
          Google Forms is turned off under Integrations. Students see the
          Profiling step as temporarily unavailable until it is back on.
        </p>
      ) : null}
      <p className="text-sm text-muted">
        Edit questions opens the Google Forms editor beside this page; the
        preview refreshes when you switch back. Students open the form from
        their Profiling step, answer it, then press &ldquo;I&apos;ve
        submitted&rdquo; to pull their response in for review.
      </p>
      {data.responderUri ? (
        <div className="overflow-hidden rounded-lg border border-border bg-white">
          <div className="flex items-center justify-between gap-2 border-b border-border bg-surface px-3 py-1.5">
            <p className="min-w-0 truncate text-xs font-medium text-muted">
              {editor.editing
                ? "Live preview · refreshes when you return from the editor"
                : "Live preview"}
            </p>
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={editor.reload}
                className="rounded-md px-2 py-1 text-xs font-medium text-ink hover:bg-surface-raised"
              >
                Refresh
              </button>
              <button
                type="button"
                onClick={() => setFullscreen(true)}
                className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-ink hover:bg-surface-raised"
              >
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  aria-hidden="true"
                >
                  <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
                </svg>
                Full screen
              </button>
            </div>
          </div>
          <iframe
            key={editor.reloadKey}
            src={embeddedFormUrl(data.responderUri)}
            title={`${data.title ?? "Profiling form"} — preview`}
            loading="lazy"
            className="block h-[560px] w-full border-0"
          />
        </div>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={editor.openEditor}
          className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-primary/90"
        >
          Edit questions
        </button>
        {data.responderUri ? (
          <a
            href={data.responderUri}
            target="_blank"
            rel="noreferrer"
            className={linkCls}
          >
            Open student link
          </a>
        ) : null}
        <button
          onClick={() => setConfirmRemove(true)}
          className="rounded-lg px-3 py-1.5 text-sm font-medium text-error hover:bg-error/5"
        >
          Unlink form
        </button>
      </div>

      {data.responderUri ? (
        <FormPreviewFullscreen
          open={fullscreen}
          title={data.title ?? "Profiling form"}
          src={embeddedFormUrl(data.responderUri)}
          reloadKey={editor.reloadKey}
          onedit={editor.openEditor}
          onclose={closeFullscreen}
        />
      ) : null}

      <ConfirmDialog
        open={confirmRemove}
        title="Unlink profiling form?"
        body="Students will not be able to complete Profiling until a new form is created. The Google Form and its responses stay in Google Drive."
        confirmLabel="Unlink"
        destructive
        busy={busy}
        onconfirm={() => {
          setConfirmRemove(false);
          onremove();
        }}
        onclose={() => setConfirmRemove(false)}
      />
    </div>
  );
}
