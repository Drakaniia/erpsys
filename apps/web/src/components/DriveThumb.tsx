import { usePreviewSrc } from "$lib/storage/use-preview-src";
import { isPdfItem } from "$lib/storage/preview";
import FileChip from "./FileChip";

export type ThumbItem = {
  id: string;
  fileKey?: string | null;
  fileUrl?: string | null;
  mime?: string | null;
  name?: string | null;
};

/** PDF → file-chip; images → <img> via the content endpoint (409→fallback). */
export default function DriveThumb({
  item,
  alt,
  className,
  onClick,
  label,
}: {
  item: ThumbItem;
  alt: string;
  className?: string;
  onClick?: () => void;
  label?: string;
}) {
  const src = usePreviewSrc(item);
  if (isPdfItem(item))
    return (
      <FileChip
        name={item.name ?? item.fileUrl?.split("/").pop()}
        href={src}
        compact
      />
    );
  if (!src) return <div className={className} aria-busy="true" />;
  if (onClick)
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label={label ?? alt}
        className="block h-full w-full overflow-hidden transition-transform duration-100 ease-out active:scale-[0.98]"
      >
        <img src={src} alt={alt} loading="lazy" className={className} />
      </button>
    );
  return <img src={src} alt={alt} loading="lazy" className={className} />;
}
