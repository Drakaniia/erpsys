export const IMAGE_COMPRESSION = {
  maxEdge: 2560,
  minBytes: 300 * 1024,
  quality: 0.9,
  minSavingRatio: 0.1,
} as const;

export type DecodedImage = {
  width: number;
  height: number;
  source: CanvasImageSource;
  release?: () => void;
};

export type CompressDeps = {
  decode: (file: File) => Promise<DecodedImage | null>;
  encode: (
    image: DecodedImage,
    width: number,
    height: number,
    mime: string,
    quality: number,
  ) => Promise<Blob | null>;
};

export function encodeMimeFor(mime: string): string | null {
  if (mime === "image/jpeg") return "image/jpeg";
  if (mime === "image/png" || mime === "image/webp") return "image/webp";
  return null;
}

export function isCompressibleImage(file: { type: string }): boolean {
  return encodeMimeFor(file.type) !== null;
}

export function targetDimensions(
  width: number,
  height: number,
  maxEdge: number = IMAGE_COMPRESSION.maxEdge,
): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= maxEdge || longest === 0) return { width, height };
  const scale = maxEdge / longest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function fileNameFor(name: string, mime: string): string {
  const ext = mime === "image/jpeg" ? "jpg" : "webp";
  if (name.toLowerCase().endsWith(`.${ext}`)) return name;
  const stripped = name.replace(/\.[^./\\]+$/, "");
  return `${stripped || "upload"}.${ext}`;
}

async function decodeWithBitmap(file: File): Promise<DecodedImage> {
  const bitmap = await createImageBitmap(file, {
    imageOrientation: "from-image",
  });
  return {
    width: bitmap.width,
    height: bitmap.height,
    source: bitmap,
    release: () => bitmap.close(),
  };
}

async function encodeOnCanvas(
  image: DecodedImage,
  width: number,
  height: number,
  mime: string,
  quality: number,
): Promise<Blob | null> {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  if (mime === "image/jpeg") {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
  }
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(image.source, 0, 0, width, height);
  return await new Promise<Blob | null>((resolve) => {
    canvas.toBlob((blob) => resolve(blob), mime, quality);
  });
}

export async function compressImageFile(
  file: File,
  deps: CompressDeps = {
    decode: decodeWithBitmap,
    encode: encodeOnCanvas,
  },
): Promise<File> {
  if (!encodeMimeFor(file.type) || file.size <= IMAGE_COMPRESSION.minBytes)
    return file;
  let decoded: DecodedImage | null = null;
  try {
    decoded = await deps.decode(file);
    if (!decoded) return file;
    const target = targetDimensions(decoded.width, decoded.height);
    const blob = await deps.encode(
      decoded,
      target.width,
      target.height,
      encodeMimeFor(file.type) as string,
      IMAGE_COMPRESSION.quality,
    );
    if (!blob || blob.size === 0) return file;
    if (blob.size > file.size * (1 - IMAGE_COMPRESSION.minSavingRatio))
      return file;
    const mime = encodeMimeFor(file.type) as string;
    return new File([blob], fileNameFor(file.name, mime), {
      type: mime,
      lastModified: file.lastModified,
    });
  } catch {
    return file;
  } finally {
    decoded?.release?.();
  }
}
