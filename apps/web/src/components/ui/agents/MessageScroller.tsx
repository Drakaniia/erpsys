import {
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type HTMLAttributes,
  type ReactNode,
  type Ref,
} from "react";

export interface MessageScrollerHandle {
  scrollToEnd: () => void;
}

export default function MessageScroller({
  followOutput = true,
  followThreshold = 56,
  smooth = true,
  onfollowchange,
  label = "Conversation",
  busy = false,
  viewportClassName = "",
  contentClassName = "",
  className = "",
  children,
  ref,
  ...rest
}: {
  followOutput?: boolean;
  followThreshold?: number;
  smooth?: boolean;
  onfollowchange?: (following: boolean) => void;
  label?: string;
  busy?: boolean;
  viewportClassName?: string;
  contentClassName?: string;
  className?: string;
  children?: ReactNode;
  ref?: Ref<MessageScrollerHandle>;
} & HTMLAttributes<HTMLDivElement>) {
  const viewportEl = useRef<HTMLElement | null>(null);
  const contentEl = useRef<HTMLElement | null>(null);
  const [following, setFollowing] = useState(true);
  const followingRef = useRef(true);

  function distanceFromEnd(el: HTMLElement): number {
    return el.scrollHeight - el.scrollTop - el.clientHeight;
  }

  function pinToEnd() {
    const el = viewportEl.current;
    if (!el) return;
    const behavior: ScrollBehavior = smooth && !busy ? "smooth" : "auto";
    if (typeof el.scrollTo === "function") {
      el.scrollTo({ top: el.scrollHeight, behavior });
    } else {
      el.scrollTop = el.scrollHeight;
    }
  }

  function handleScroll() {
    const el = viewportEl.current;
    if (!el) return;
    const atEnd = distanceFromEnd(el) <= followThreshold;
    if (atEnd === followingRef.current) return;
    followingRef.current = atEnd;
    setFollowing(atEnd);
    onfollowchange?.(atEnd);
  }

  useImperativeHandle(ref, () => ({
    scrollToEnd() {
      followingRef.current = true;
      setFollowing(true);
      onfollowchange?.(true);
      pinToEnd();
    },
  }));

  useEffect(() => {
    const content = contentEl.current;
    if (!content) return;
    if (following && followOutput) pinToEnd();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      if (followingRef.current && followOutput) pinToEnd();
    });
    ro.observe(content);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [following, followOutput]);

  useEffect(() => {
    if (followOutput) pinToEnd();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busy, smooth, followThreshold, followOutput]);

  return (
    <div {...rest} className={`relative h-full min-h-0 w-full ${className}`}>
      <div
        ref={(node) => {
          viewportEl.current = node;
        }}
        role="log"
        aria-label={label}
        aria-busy={busy}
        onScroll={handleScroll}
        className={`h-full w-full overflow-y-auto overscroll-contain ${viewportClassName}`}
      >
        <div
          ref={(node) => {
            contentEl.current = node;
          }}
          className={`flex w-full flex-col ${contentClassName}`}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
