import type { UploadRow } from "../models/UploadModel.js";

export type StorageUploadWire = {
  id: string;
  fileKey: string | null;
  fileUrl: string | null;
  kind: string;
  expiresAt: string | null;
  expired: boolean;
};

export function storageUploadWire(row: UploadRow): StorageUploadWire {
  const expiresAt =
    row.expiresAt instanceof Date
      ? row.expiresAt.toISOString()
      : (row.expiresAt ?? null);
  return {
    id: String(row._id),
    fileKey: row.fileKey ?? null,
    fileUrl: row.fileUrl ?? null,
    kind: String(row.kind ?? ""),
    expiresAt,
    expired: false,
  };
}
