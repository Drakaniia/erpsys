import { useEffect, useRef, useState } from "react";
import { useIntegrations } from "$lib/integrations/use-integrations";
import { validateStorageFile } from "$lib/storage/use-storage-upload";
import { useStorageUpload } from "$lib/storage/use-storage-upload";
import CameraCapture from "./CameraCapture";
import EvidenceUploadPanel from "./EvidenceUploadPanel";
import LinkManager from "./LinkManager";

type EvidenceItem = {
  id: string;
  fileUrl: string;
  fileKey?: string | null;
  mime?: string | null;
  name?: string | null;
  kind: string;
  expiresAt?: string | null;
  expired?: boolean;
};

type Tab = "upload" | "link" | "camera";

type PendingFile = { id: string; file: File; previewUrl: string | null };

function revokePreview(entry: PendingFile) {
  if (entry.previewUrl) URL.revokeObjectURL(entry.previewUrl);
}

function getDomainBadge(url: string): string {
  try {
    const h = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
    if (h === "drive.google.com") return "drive.google.com";
    if (h === "storage.to" || h.endsWith(".storage.to")) return "storage.to";
    return h;
  } catch {
    return "";
  }
}

export default function EvidenceSlot({
  items,
  multiple = false,
  locked,
  label,
  hint,
  uploading,
  onupload,
  ondelete,
  onpreview,
  onqueue,
  stepCode,
  cameraEnabled = false,
  onUpsertLink,
  onRemoveLink,
  linkBusy = false,
}: {
  items: EvidenceItem[];
  multiple?: boolean;
  locked: boolean;
  label: string;
  hint?: string;
  uploading: boolean;
  onupload: (fileKey: string, fileUrl: string) => Promise<void>;
  ondelete: (uploadId: string) => void;
  onpreview: (index: number) => void;
  onqueue?: (run: (() => Promise<void>) | null) => void;
  stepCode?: string;
  cameraEnabled?: boolean;
  onUpsertLink?: (url: string) => Promise<void>;
  onRemoveLink?: () => Promise<void>;
  linkBusy?: boolean;
}) {
  const liveCount = items.filter(
    (e) => e.kind !== "EXTERNAL_LINK" && !e.expired,
  ).length;
  const { flags } = useIntegrations();
  // Camera capture is an R2 upload; with R2 off the tab and the capture flow
  // never render. Pasting a link is not storage, so it stays.
  const camera = cameraEnabled && flags.r2;
  const autoCamera = camera && !locked && liveCount === 0;
  const [activeTab, setActiveTab] = useState<Tab>(
    stepCode === "MUGSHOT" && autoCamera ? "camera" : "upload",
  );

  const prevStepCode = useRef(stepCode);
  useEffect(() => {
    if (stepCode === prevStepCode.current) return;
    prevStepCode.current = stepCode;
    setActiveTab((tab) => {
      const auto = camera && !locked && liveCount === 0;
      if (tab === "camera" && !auto) return "upload";
      if (stepCode === "MUGSHOT" && auto) return "camera";
      return tab;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepCode]);

  const externalLink = items.find((e) => e.kind === "EXTERNAL_LINK") ?? null;
  const [linkInput, setLinkInput] = useState("");
  const [linkError, setLinkError] = useState<string | null>(null);
  const [linkSaving, setLinkSaving] = useState(false);
  const [pending, setPending] = useState<PendingFile[]>([]);

  useEffect(() => {
    if (externalLink) setLinkInput(externalLink.fileUrl);
  }, [externalLink?.fileUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  const { upload } = useStorageUpload("evidenceImage");

  const pendingRef = useRef<PendingFile[]>([]);
  pendingRef.current = pending;

  const flushRef = useRef<() => Promise<void>>(async () => {});
  flushRef.current = async () => {
    for (const entry of pendingRef.current) {
      const done = await upload(entry.file, { stepCode });
      await onupload(done.fileKey, done.fileUrl);
      revokePreview(entry);
      setPending((prev) => prev.filter((p) => p.id !== entry.id));
    }
  };

  const hasPending = pending.length > 0;
  useEffect(() => {
    onqueue?.(hasPending ? () => flushRef.current() : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasPending]);

  useEffect(
    () => () => pendingRef.current.forEach(revokePreview),
    [],
  );

  function addPending(file: File) {
    setPending((prev) => [
      ...prev,
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        file,
        previewUrl:
          file.type === "application/pdf" ? null : URL.createObjectURL(file),
      },
    ]);
  }

  function dropPending(id: string) {
    const entry = pendingRef.current.find((p) => p.id === id);
    if (entry) revokePreview(entry);
    setPending((prev) => prev.filter((p) => p.id !== id));
  }

  function isAllowedHost(hostname: string): boolean {
    const h = hostname.toLowerCase().replace(/^www\./, "");
    return (
      h === "drive.google.com" ||
      h === "storage.to" ||
      h.endsWith(".storage.to")
    );
  }

  function validateLink(url: string): string | null {
    const raw = url.trim();
    if (!raw) return "Paste a link first.";
    let parsed: URL;
    try {
      parsed = new URL(raw);
    } catch {
      return "Enter a valid https:// link.";
    }
    if (parsed.protocol !== "https:") return "Enter a valid https:// link.";
    if (!isAllowedHost(parsed.hostname))
      return "Only storage.to and Google Drive links allowed — use https://storage.to/... or https://drive.google.com/...";
    return null;
  }

  async function handleLinkSave() {
    const err = validateLink(linkInput);
    if (err) {
      setLinkError(err);
      return;
    }
    if (!onUpsertLink) return;
    setLinkError(null);
    setLinkSaving(true);
    try {
      await onUpsertLink(linkInput.trim());
    } catch (e) {
      setLinkError(
        (e as { message?: string }).message ??
          "Could not save link — try again.",
      );
    } finally {
      setLinkSaving(false);
    }
  }

  async function handleLinkRemove() {
    if (!onRemoveLink) return;
    setLinkError(null);
    setLinkSaving(true);
    try {
      await onRemoveLink();
      setLinkInput("");
    } catch (e) {
      setLinkError(
        (e as { message?: string }).message ?? "Could not remove link.",
      );
    } finally {
      setLinkSaving(false);
    }
  }

  function handleCameraCapture(file: File) {
    const invalid = validateStorageFile(file, "evidenceImage");
    if (invalid) {
      setLinkError(invalid);
      return;
    }
    setLinkError(null);
    addPending(file);
    setActiveTab("upload");
  }

  return (
    <div>
      {!locked ? (
        <div
          role="tablist"
          aria-label="Evidence input"
          className={`mb-3 grid w-full grid-cols-2 gap-1 rounded-xl bg-surface p-1 ${camera ? "grid-cols-3" : ""}`}
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "upload"}
            aria-controls="tab-upload"
            onClick={() => setActiveTab("upload")}
            className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${activeTab === "upload" ? "border border-border bg-surface-raised text-ink shadow-sm" : "text-muted hover:text-ink"}`}
          >
            Upload file
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "link"}
            aria-controls="tab-link"
            onClick={() => setActiveTab("link")}
            className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${activeTab === "link" ? "border border-border bg-surface-raised text-ink shadow-sm" : "text-muted hover:text-ink"}`}
          >
            Paste link
          </button>
          {camera ? (
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "camera"}
              aria-controls="tab-camera"
              onClick={() => setActiveTab("camera")}
              className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${activeTab === "camera" ? "border border-border bg-surface-raised text-ink shadow-sm" : "text-muted hover:text-ink"}`}
            >
              Camera
            </button>
          ) : null}
        </div>
      ) : null}

      {!locked && activeTab === "link" ? (
        <LinkManager
          externalLink={externalLink}
          linkInput={linkInput}
          linkError={linkError}
          linkSaving={linkSaving}
          linkBusy={linkBusy}
          onsave={handleLinkSave}
          onremove={handleLinkRemove}
          oninput={(v) => setLinkInput(v)}
        />
      ) : !locked && activeTab === "camera" && camera ? (
        <CameraCapture
          enabled={camera}
          busy={linkBusy}
          oncapture={handleCameraCapture}
          onswitchtab={() => setActiveTab("upload")}
        />
      ) : (
        <EvidenceUploadPanel
          items={items}
          multiple={multiple}
          locked={locked}
          label={label}
          hint={hint}
          uploading={uploading}
          pending={pending.map((p) => ({
            id: p.id,
            name: p.file.name,
            previewUrl: p.previewUrl,
          }))}
          onpick={addPending}
          onremovepending={dropPending}
          ondelete={ondelete}
          onpreview={onpreview}
          route="evidenceImage"
        />
      )}

      {!locked && activeTab !== "link" && externalLink ? (
        <div className="mt-3 flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2">
          <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
            {getDomainBadge(externalLink.fileUrl)}
          </span>
          <span
            className="min-w-0 flex-1 truncate text-sm text-ink"
            title={externalLink.fileUrl}
          >
            {externalLink.fileUrl}
          </span>
          <a
            href={externalLink.fileUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 text-xs font-medium text-primary hover:underline"
          >
            Open
          </a>
          <button
            type="button"
            onClick={handleLinkRemove}
            disabled={linkSaving || linkBusy}
            aria-label="Remove link"
            className="ml-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border bg-surface text-muted hover:text-error disabled:opacity-50"
          >
            <svg
              width="10"
              height="10"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
            >
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
      ) : null}

      {locked && externalLink ? (
        <div className="mt-3 flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2">
          <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
            {getDomainBadge(externalLink.fileUrl)}
          </span>
          <span
            className="min-w-0 flex-1 truncate text-sm text-ink"
            title={externalLink.fileUrl}
          >
            {externalLink.fileUrl}
          </span>
          <a
            href={externalLink.fileUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 text-xs font-medium text-primary hover:underline"
          >
            Open
          </a>
        </div>
      ) : null}

      {linkError && activeTab !== "link" ? (
        <p className="mt-2 text-xs text-error" aria-live="polite">
          {linkError}
        </p>
      ) : null}
    </div>
  );
}
