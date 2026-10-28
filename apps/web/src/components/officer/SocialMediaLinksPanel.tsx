import { useState } from "react";
import type { SocialMediaLinkData } from "$lib/officer/types";
import ConfirmDialog from "../ConfirmDialog";
import EmptyState from "../ui/EmptyState";
import { SocialLinksSkeleton } from "./SkeletonRows";

export default function SocialMediaLinksPanel({
  data,
  isLoading = false,
  busy,
  onsave,
  onremove,
  onreorder,
}: {
  data: SocialMediaLinkData[] | undefined;
  isLoading?: boolean;
  busy: boolean;
  onsave: (name: string, url: string, id?: string) => void;
  onremove: (id: string) => void;
  onreorder: (orderedIds: string[]) => void;
}) {
  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const [nameInput, setNameInput] = useState("");
  const [urlInput, setUrlInput] = useState("");
  const [nameError, setNameError] = useState("");
  const [urlError, setUrlError] = useState("");
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);

  const items = data ?? [];

  function startAdd() {
    setNameInput("");
    setUrlInput("");
    setNameError("");
    setUrlError("");
    setEditingId("new");
  }

  function startEdit(id: string) {
    const link = items.find((l) => l.id === id);
    setNameInput(link?.name ?? "");
    setUrlInput(link?.url ?? "");
    setNameError("");
    setUrlError("");
    setEditingId(id);
  }

  function validate(name: string, url: string): boolean {
    const nameErr = name.trim() ? "" : "Enter the page name.";
    setNameError(nameErr);
    if (nameErr) return false;
    const value = url.trim();
    if (!value) {
      setUrlError("Paste the page link.");
      return false;
    }
    try {
      const parsed = new URL(value);
      if (parsed.protocol !== "https:" && parsed.protocol !== "http:")
        throw new Error();
      setUrlError("");
    } catch {
      setUrlError("That does not look like a valid link.");
      return false;
    }
    return true;
  }

  function submit() {
    if (!validate(nameInput, urlInput)) return;
    onsave(
      nameInput.trim(),
      urlInput.trim(),
      editingId === "new" ? undefined : (editingId ?? undefined),
    );
    setEditingId(null);
  }

  function move(id: string, dir: -1 | 1) {
    const i = items.findIndex((l) => l.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= items.length) return;
    const next = items.slice();
    [next[i], next[j]] = [next[j], next[i]];
    onreorder(next.map((l) => l.id));
  }

  const removingLink = confirmRemoveId
    ? (items.find((l) => l.id === confirmRemoveId) ?? null)
    : null;

  return (
    <div>
      {isLoading && data === undefined ? (
        <SocialLinksSkeleton />
      ) : items.length === 0 && editingId !== "new" ? (
        <div className="flex flex-col items-start gap-4 rounded-xl border border-border bg-surface-raised p-6">
          <EmptyState
            title="No social media pages yet"
            hint="Students see these pages in step 2 and must like/follow ALL of them before submitting."
            icon="inbox"
          />
          <button
            onClick={startAdd}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition-[transform,background-color] duration-100 ease-out active:scale-[0.97]"
          >
            Add page
          </button>
        </div>
      ) : editingId !== null ? (
        <div className="flex flex-col gap-4 rounded-xl border border-border bg-surface-raised p-6">
          <div className="flex flex-col gap-1">
            <label htmlFor="link-name" className="text-sm font-medium text-ink">
              Page name
            </label>
            <input
              id="link-name"
              value={nameInput}
              onChange={(e) => {
                setNameInput(e.currentTarget.value);
                if (nameError) validate(e.currentTarget.value, urlInput);
              }}
              type="text"
              placeholder="e.g. COT SBO"
              className={`w-full max-w-xl rounded-lg border bg-surface px-3 py-2 text-sm text-ink ${nameError ? "border-error" : "border-border"}`}
              aria-invalid={!!nameError}
              aria-describedby={nameError ? "link-name-error" : undefined}
            />
            {nameError && (
              <p
                id="link-name-error"
                className="text-xs text-error"
                role="alert"
              >
                {nameError}
              </p>
            )}
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="link-url" className="text-sm font-medium text-ink">
              Page link
            </label>
            <input
              id="link-url"
              value={urlInput}
              onChange={(e) => {
                setUrlInput(e.currentTarget.value);
                if (urlError) validate(nameInput, e.currentTarget.value);
              }}
              type="url"
              placeholder="https://www.facebook.com/…"
              className={`w-full max-w-xl rounded-lg border bg-surface px-3 py-2 text-sm text-ink ${urlError ? "border-error" : "border-border"}`}
              aria-invalid={!!urlError}
              aria-describedby={urlError ? "link-url-error" : undefined}
            />
            <p className="text-xs text-muted">
              Opens in a new tab for students in step 2.
            </p>
            {urlError && (
              <p
                id="link-url-error"
                className="text-xs text-error"
                role="alert"
              >
                {urlError}
              </p>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={submit}
              disabled={busy}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {busy ? "Saving…" : "Save"}
            </button>
            <button
              onClick={() => {
                setEditingId(null);
                setNameError("");
                setUrlError("");
              }}
              className="rounded-lg px-4 py-2 text-sm text-muted transition-[transform,background-color] duration-100 ease-out hover:text-ink active:scale-[0.97]"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface-raised p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-ink">
                Pages students must like & follow
              </p>
              <p className="text-xs text-muted">
                Step 2 requires following all pages below.
              </p>
            </div>
            <button
              onClick={startAdd}
              className="shrink-0 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-white"
            >
              Add page
            </button>
          </div>
          <ul className="divide-y divide-border">
            {items.map((link, i) => (
              <li key={link.id} className="flex items-center gap-3 py-2.5">
                <div className="flex shrink-0 flex-col">
                  <button
                    type="button"
                    onClick={() => move(link.id, -1)}
                    disabled={i === 0 || busy}
                    aria-label={`Move ${link.name} up`}
                    className="rounded p-0.5 text-muted transition-[transform,background-color] duration-100 ease-out hover:text-ink active:scale-[0.97] disabled:opacity-30"
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="m18 15-6-6-6 6" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    onClick={() => move(link.id, 1)}
                    disabled={i === items.length - 1 || busy}
                    aria-label={`Move ${link.name} down`}
                    className="rounded p-0.5 text-muted transition-[transform,background-color] duration-100 ease-out hover:text-ink active:scale-[0.97] disabled:opacity-30"
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="m6 9 6 6 6-6" />
                    </svg>
                  </button>
                </div>
                <div className="min-w-0 flex-1">
                  <a
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block truncate text-sm font-medium text-ink hover:text-primary"
                  >
                    {link.name}
                  </a>
                  <p className="truncate text-xs text-muted">{link.url}</p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <button
                    onClick={() => startEdit(link.id)}
                    className="rounded-lg border border-border px-2.5 py-1 text-xs text-ink transition-[transform,background-color] duration-100 ease-out hover:bg-surface active:scale-[0.97]"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => setConfirmRemoveId(link.id)}
                    className="rounded-lg px-2.5 py-1 text-xs font-medium text-error transition-[transform,background-color] duration-100 ease-out hover:bg-error/5 active:scale-[0.97]"
                  >
                    Remove
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
      <ConfirmDialog
        open={confirmRemoveId !== null}
        title={
          removingLink ? `Remove "${removingLink.name}"?` : "Remove this page?"
        }
        body="Students will no longer see it in step 2 until it is added again."
        confirmLabel="Remove"
        destructive
        busy={busy}
        onconfirm={() => {
          const id = confirmRemoveId;
          setConfirmRemoveId(null);
          if (id) onremove(id);
        }}
        onclose={() => setConfirmRemoveId(null)}
      />
    </div>
  );
}
