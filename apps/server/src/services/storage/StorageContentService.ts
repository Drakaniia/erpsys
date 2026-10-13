import { getObjectStream, getR2Client } from "../../lib/storage/client.js";
import { env } from "../../lib/platform/env.js";
import { parseR2FileKey } from "../../lib/storage/storage.js";
import { UploadModel } from "../../models/UploadModel.js";
import { UploadAccessService } from "./UploadAccessService.js";
import type { SessionUser } from "./StorageSessionService.js";

export type ContentResult =
  | { kind: "not-storage" }
  | {
      kind: "stream";
      status: number;
      contentType: string;
      contentLength?: string;
      contentRange?: string;
      stream: NodeJS.ReadableStream;
    };

export class StorageContentService {
  static async open(args: {
    uploadId: string;
    user: SessionUser;
    range?: string;
  }): Promise<ContentResult> {
    const row = await UploadModel.findById(args.uploadId);
    const parsed = parseR2FileKey(row?.fileKey);
    if (!row || !parsed || row.backend !== "r2") return { kind: "not-storage" };

    if (row.uploadedById !== args.user.id) {
      await UploadAccessService.assertCanView(row, args.user);
    }

    const client = getR2Client({
      endpoint: env.R2_ENDPOINT,
      accessKeyId: env.R2_ACCESS_KEY_ID,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY,
      bucket: env.R2_BUCKET,
    });
    const download = await getObjectStream(client, {
      bucket: parsed.bucket,
      key: parsed.key,
      ...(args.range ? { range: args.range } : {}),
    });
    return { kind: "stream", ...download };
  }
}
