import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "$lib/api";
import {
  STORAGE_ACCEPT,
  validateStorageFile,
} from "$lib/storage/use-storage-upload";
import { useStorageUpload } from "$lib/storage/use-storage-upload";
import { useIntegrations } from "$lib/integrations/use-integrations";
import { notify } from "$lib/notifications";

export default function StampPanel({
  open,
  isOfficerSurface,
  onclose,
}: {
  open: boolean;
  isOfficerSurface: boolean;
  onclose: () => void;
}) {
  const queryClient = useQueryClient();
  const stampQuery = useQuery(
    api.officer.getStamp.queryOptions({ enabled: open && isOfficerSurface }),
  );
  const updateStamp = useMutation(api.officer.updateStamp.mutationOptions());

  const [stampName, setStampName] = useState("");
  const [stampSignatureUrl, setStampSignatureUrl] = useState<string | null>(
    null,
  );
  const [pendingSignatureFile, setPendingSignatureFile] = useState<File | null>(
    null,
  );
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successOpen, setSuccessOpen] = useState(false);

  const { upload: uploadStamp } = useStorageUpload("stampImage");
  // A disabled integration must not hide the signature an officer already
  // uploaded — only the affordance that would 503 on the mint.
  const { flags } = useIntegrations();
  const canUpload = flags.r2;

  useEffect(() => {
    if (open && stampQuery.data) {
      setStampName(stampQuery.data.name ?? "");
      setStampSignatureUrl(stampQuery.data.signatureUrl);
      setPendingSignatureFile(null);
    }
  }, [open, stampQuery.data]);

  async function onFileSelected(file?: File) {
    if (!file) return;
    const invalid = validateStorageFile(file, "stampImage");
    if (invalid) {
      setErrorMsg(invalid);
      return;
    }
    setErrorMsg("");
    const dataUrl = await new Promise<string>((resolveReader) => {
      const reader = new FileReader();
      reader.onload = () => resolveReader(String(reader.result));
      reader.readAsDataURL(file);
    });
    setStampSignatureUrl(dataUrl);
    setPendingSignatureFile(file);
  }

  async function saveStamp() {
    setSaving(true);
    setErrorMsg("");
    try {
      const input: {
        name?: string;
        signatureUrl?: string;
        signatureFileKey?: string;
      } = {};
      if (stampName.trim()) input.name = stampName.trim();
      if (pendingSignatureFile) {
        const done = await uploadStamp(pendingSignatureFile);
        if (!done) throw new Error("Signature upload failed.");
        input.signatureUrl = done.fileUrl;
        input.signatureFileKey = done.fileKey;
      }
      await updateStamp.mutateAsync(input);
      await queryClient.invalidateQueries({ queryKey: ["officer"] });
      onclose();
      setSuccessOpen(true);
      notify.success("Stamp saved");
    } catch (e) {
      console.error(e);
      setErrorMsg("Could not save stamp.");
    } finally {
      setSaving(false);
    }
  }

  function closeStamp() {
    onclose();
    setErrorMsg("");
  }

  function closeSuccess() {
    setSuccessOpen(false);
  }

  return (
    <>
      <div className="space-y-3 px-3 py-2">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-ink">My stamp</p>
          <button
            className="text-xs text-muted transition-colors hover:text-ink active:scale-[0.97]"
            onClick={closeStamp}
          >
            ← back
          </button>
        </div>

        <div>
          <label
            htmlFor="stamp-name"
            className="mb-1 block text-xs font-medium text-ink"
          >
            Name on stamp
          </label>
          <input
            id="stamp-name"
            value={stampName}
            onChange={(e) => setStampName(e.target.value)}
            maxLength={80}
            className="w-full rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-ink"
            placeholder="e.g. M. Santos"
          />
        </div>

        <div>
          <span className="mb-1 block text-xs font-medium text-ink">
            Signature (optional)
          </span>
          {stampSignatureUrl ? (
            <img
              src={stampSignatureUrl}
              alt="Signature preview"
              className="mb-1 flex h-16 w-16 items-center justify-center overflow-hidden rounded-lg border border-border bg-surface object-contain"
              style={{ mixBlendMode: "multiply" }}
            />
          ) : null}
          {canUpload ? (
            <label className="flex h-16 w-16 cursor-pointer items-center justify-center overflow-hidden rounded-lg border border-dashed border-border bg-surface text-xs text-muted hover:text-ink">
              {!stampSignatureUrl ? "Upload" : "Replace"}
              <input
                type="file"
                accept={STORAGE_ACCEPT}
                className="sr-only"
                onChange={(e) =>
                  void onFileSelected(e.currentTarget.files?.[0])
                }
              />
            </label>
          ) : !stampSignatureUrl ? (
            <span className="block text-xs text-muted">
              Uploads are paused — set the name above to save without one.
            </span>
          ) : null}
        </div>

        {errorMsg ? (
          <p className="text-xs text-error" role="alert">
            {errorMsg}
          </p>
        ) : null}

        <div className="flex justify-end gap-2">
          <button
            className="rounded-lg px-3 py-1.5 text-sm text-muted transition-[transform,background-color] duration-100 ease-out hover:text-ink active:scale-[0.97]"
            onClick={closeStamp}
          >
            Cancel
          </button>
          <button
            className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-white transition-transform duration-100 ease-out active:scale-[0.97] disabled:opacity-50"
            onClick={() => void saveStamp()}
            disabled={saving}
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>

      {successOpen ? (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="stamp-saved-title"
        >
          <div
            className="absolute inset-0 bg-ink/25"
            onClick={closeSuccess}
            aria-hidden="true"
          />
          <div className="relative w-full max-w-sm rounded-2xl border border-border bg-surface-raised p-5 shadow-xl">
            <div className="flex flex-col items-center gap-3 text-center">
              <span
                className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary"
                aria-hidden="true"
              >
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M20 6 9 17l-5-5" />
                </svg>
              </span>
              <h2
                id="stamp-saved-title"
                className="text-base font-semibold text-ink"
              >
                Saved
              </h2>
              <p className="text-sm text-muted">Your stamp is updated.</p>
            </div>
            <button
              type="button"
              className="mt-5 w-full rounded-xl bg-primary py-2.5 text-sm font-semibold text-white"
              onClick={closeSuccess}
            >
              Done
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
