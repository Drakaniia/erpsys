import { Readable } from "node:stream";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export type R2ClientConfig = {
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  region?: string;
};

export const R2_PUT_URL_EXPIRES_SECS = 15 * 60;

export function getR2Client(config: R2ClientConfig): S3Client {
  return new S3Client({
    region: config.region ?? "auto",
    endpoint: config.endpoint,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
    forcePathStyle: false,
  });
}

export type PresignedPutArgs = {
  bucket: string;
  key: string;
  contentType: string;
  contentLength: number;
  expiresInSecs?: number;
};

export async function presignedPutUrl(
  client: S3Client,
  args: PresignedPutArgs,
): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: args.bucket,
    Key: args.key,
    ContentType: args.contentType,
    ContentLength: args.contentLength,
  });
  return getSignedUrl(client, command, {
    expiresIn: args.expiresInSecs ?? R2_PUT_URL_EXPIRES_SECS,
  });
}

export type R2ObjectMeta = {
  sizeBytes: number | null;
  contentType: string | null;
  etag: string | null;
};

export async function headObjectExists(
  client: S3Client,
  args: { bucket: string; key: string },
): Promise<R2ObjectMeta | null> {
  try {
    const out = await client.send(
      new HeadObjectCommand({ Bucket: args.bucket, Key: args.key }),
    );
    return {
      sizeBytes:
        typeof out.ContentLength === "number" ? out.ContentLength : null,
      contentType: out.ContentType ?? null,
      etag: out.ETag?.replaceAll('"', "") ?? null,
    };
  } catch (error) {
    if (objectNotFound(error)) return null;
    throw error;
  }
}

export type R2Download = {
  status: number;
  contentType: string;
  contentLength?: string;
  contentRange?: string;
  stream: NodeJS.ReadableStream;
};

export async function getObjectStream(
  client: S3Client,
  args: { bucket: string; key: string; range?: string },
): Promise<R2Download> {
  const out = await client.send(
    new GetObjectCommand({
      Bucket: args.bucket,
      Key: args.key,
      ...(args.range ? { Range: args.range } : {}),
    }),
  );
  if (!out.Body) throw new Error("R2 returned no body.");
  const stream =
    out.Body instanceof Readable
      ? out.Body
      : Readable.fromWeb(out.Body as never);
  return {
    status: args.range ? 206 : 200,
    contentType: out.ContentType ?? "application/octet-stream",
    contentLength:
      out.ContentLength !== undefined ? String(out.ContentLength) : undefined,
    contentRange: out.ContentRange ?? undefined,
    stream,
  };
}

export async function deleteR2Object(
  client: S3Client,
  args: { bucket: string; key: string },
): Promise<void> {
  try {
    await client.send(
      new DeleteObjectCommand({ Bucket: args.bucket, Key: args.key }),
    );
  } catch (error) {
    if (objectNotFound(error)) return;
    throw error;
  }
}

function objectNotFound(error: unknown): boolean {
  const name = (error as { name?: unknown }).name;
  if (name === "NotFound" || name === "NoSuchKey") return true;
  const status = (error as { $metadata?: { httpStatusCode?: unknown } })
    .$metadata?.httpStatusCode;
  return status === 404;
}
