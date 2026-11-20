import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  row: null as Record<string, unknown> | null,
  deletedIds: [] as string[],
  updates: [] as Record<string, unknown>[],
  deleteR2Object: vi.fn(),
  addStoredBytes: vi.fn(),
}));

vi.mock("dotenv", () => ({ default: { config: vi.fn() } }));
vi.mock("../../src/models/UploadModel.js", () => ({
  UploadModel: class {
    static async findById() {
      return mocks.row;
    }
    static async updateById(_id: string, patch: Record<string, unknown>) {
      mocks.updates.push(patch);
      mocks.row = { ...mocks.row, ...patch };
    }
    static async deleteById(id: string) {
      mocks.deletedIds.push(id);
      mocks.row = null;
    }
    static async updateExpiredSessions() {}
    static async listPendingDeletion() {
      return mocks.row ? [mocks.row] : [];
    }
  },
}));
vi.mock("../../src/models/StepVerificationModel.js", () => ({
  StepVerificationModel: class {
    static async listEvidenceByProfile() {
      return [];
    }
    static async listAllEvidence() {
      return [];
    }
  },
}));
vi.mock("../../src/models/UserModel.js", () => ({
  UserModel: class {
    static async findByIds() {
      return [];
    }
    static async listStampUploadIds() {
      return [];
    }
  },
}));
vi.mock("../../src/lib/storage/client.js", () => ({
  deleteR2Object: mocks.deleteR2Object,
  getR2Client: vi.fn(() => ({})),
  getObjectStream: vi.fn(),
  headObjectExists: vi.fn(),
  presignedPutUrl: vi.fn(),
}));
vi.mock("../../src/lib/storage/quota.js", () => ({
  addStoredBytes: mocks.addStoredBytes,
  getUsage: vi.fn(),
  incOps: vi.fn(),
  monthKey: vi.fn(() => "2026-11"),
  shouldBlockMint: vi.fn(),
}));

beforeEach(() => {
  vi.stubEnv("R2_BUCKET", "evidence");
  mocks.row = {
    _id: "upload-1",
    backend: "r2",
    r2Status: "complete",
    r2Bucket: "evidence",
    r2Key: "erpsys/2026/evidence/user/upload-1.jpg",
    uploadedById: "user-1",
    studentProfileId: "profile-1",
    kind: "CONSENT_SCAN",
    sizeBytes: 200,
    filePurgedAt: null,
  };
  mocks.deletedIds = [];
  mocks.updates = [];
  mocks.deleteR2Object.mockReset().mockResolvedValue(undefined);
  mocks.addStoredBytes.mockReset().mockResolvedValue(undefined);
});

describe("storage deletion lifecycle", () => {
  it("deletes the object before deleting the upload row", async () => {
    const { deleteUpload } = await import("../../src/services/storage.js");
    const user = { id: "user-1", role: "STUDENT", email: "student@example.com" };

    await expect(deleteUpload(user as never, "upload-1")).resolves.toEqual({
      deleted: true,
    });

    expect(mocks.deleteR2Object).toHaveBeenCalledWith(expect.anything(), {
      bucket: "evidence",
      key: "erpsys/2026/evidence/user/upload-1.jpg",
    });
    expect(mocks.deletedIds).toEqual(["upload-1"]);
    expect(mocks.addStoredBytes).toHaveBeenCalledWith(expect.anything(), "2026-11", -200);
  });

  it("keeps a failed deletion visible and retryable", async () => {
    mocks.deleteR2Object.mockRejectedValueOnce(new Error("R2 offline"));
    const { deleteUpload } = await import("../../src/services/storage.js");
    const user = { id: "user-1", role: "STUDENT", email: "student@example.com" };

    await expect(deleteUpload(user as never, "upload-1")).rejects.toMatchObject({
      status: 502,
    });
    expect(mocks.deletedIds).toEqual([]);
    expect(mocks.row?.deletionRequestedAt).toBeInstanceOf(Date);

    await expect(deleteUpload(user as never, "upload-1")).resolves.toEqual({
      deleted: true,
    });
    expect(mocks.deletedIds).toEqual(["upload-1"]);
  });

  it("does not delete an upload that a submission has claimed", async () => {
    const { StepVerificationModel } = await import("../../src/models/StepVerificationModel.js");
    vi.spyOn(StepVerificationModel, "listEvidenceByProfile").mockResolvedValueOnce([
      { status: "SUBMITTED", evidence: { uploadIds: ["upload-1"] } },
    ]);
    const { deleteUpload } = await import("../../src/services/storage.js");
    const user = { id: "user-1", role: "STUDENT", email: "student@example.com" };

    await expect(deleteUpload(user as never, "upload-1")).rejects.toMatchObject({
      status: 409,
    });
    expect(mocks.deleteR2Object).not.toHaveBeenCalled();
    expect(mocks.deletedIds).toEqual([]);
  });

  it("sweeps a failed storage deletion and only decrements usage after success", async () => {
    mocks.row = { ...mocks.row, deletionRequestedAt: new Date() };
    mocks.deleteR2Object.mockRejectedValueOnce(new Error("R2 offline"));
    const { sweepOrphanedUploads } = await import("../../src/services/storage.js");

    await sweepOrphanedUploads();
    expect(mocks.deletedIds).toEqual([]);
    expect(mocks.addStoredBytes).not.toHaveBeenCalled();

    await sweepOrphanedUploads();
    expect(mocks.deletedIds).toEqual(["upload-1"]);
    expect(mocks.addStoredBytes).toHaveBeenCalledTimes(1);
  });
});
