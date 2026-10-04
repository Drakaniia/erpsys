import type { YearLevel } from "./constants.js";

export const TRANSFER_RESPONSE_WINDOW_MS = 10 * 60 * 1000;

export const TRANSFER_INACTIVE_GRACE_MS = 60 * 1000;

export const PRESENCE_STALE_MS = 3 * 60 * 1000;

export const TRANSFER_STATUSES = [
  "PENDING",
  "ACCEPTED",
  "DECLINED",
  "CANCELLED",
  "AUTO_TRANSFERRED",
  "EXPIRED",
] as const;

export type TransferStatus = (typeof TRANSFER_STATUSES)[number];

export type TransferRow = {
  _id: string;
  departmentId: string;
  status: TransferStatus | string;
  requesterId: string;
  ownerId: string;
  yearLevels?: YearLevel[];
  createdAt: Date;
  expiresAt: Date;
  respondedAt?: Date | null;
  resolvedAt?: Date | null;
};
