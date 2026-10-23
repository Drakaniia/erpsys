import { useMemo, type HTMLAttributes, type ReactNode } from "react";
import { MessageCtx, type MessageAlign, type MessageFrom } from "./context";
import { usePresence } from "$lib/ui/use-presence";

export default function Message({
  from,
  animateIn = false,
  className = "",
  children,
  ...rest
}: {
  from: MessageFrom;
  animateIn?: boolean;
  className?: string;
  children?: ReactNode;
} & HTMLAttributes<HTMLDivElement>) {
  const align: MessageAlign = from === "user" ? "end" : "start";
  const ctx = useMemo(() => ({ from, align }), [from, align]);
  const presence = usePresence(animateIn, { y: 8, duration: 200 });

  return (
    <MessageCtx.Provider value={ctx}>
      <div
        {...rest}
        style={{ ...presence.style, ...rest.style }}
        className={`flex w-full items-end gap-2 ${align === "end" ? "flex-row-reverse" : ""} ${className}`}
      >
        {children}
      </div>
    </MessageCtx.Provider>
  );
}
