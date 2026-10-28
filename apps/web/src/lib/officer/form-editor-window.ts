import { useCallback, useEffect, useState } from "react";

const WINDOW_NAME = "erpsys-form-editor";

type ScreenWithOrigin = Screen & { availLeft?: number; availTop?: number };

function sideWindowFeatures(): string {
  const screen = window.screen as ScreenWithOrigin;
  const screenW = screen.availWidth || window.innerWidth;
  const screenH = screen.availHeight || window.innerHeight;
  const width = Math.max(720, Math.round(screenW / 2));
  const left = (screen.availLeft ?? 0) + Math.max(0, screenW - width);
  const top = screen.availTop ?? 0;
  return `popup=yes,noopener,noreferrer,width=${width},height=${screenH},left=${left},top=${top}`;
}

export function useFormEditorWindow(editUrl: string | undefined) {
  const [reloadKey, setReloadKey] = useState(0);
  const [editing, setEditing] = useState(false);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  const openEditor = useCallback(() => {
    if (!editUrl) return;
    window.open(editUrl, WINDOW_NAME, sideWindowFeatures());
    setEditing(true);
  }, [editUrl]);

  useEffect(() => {
    if (!editing) return;
    const onFocus = () => reload();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [editing, reload]);

  return { openEditor, editing, reloadKey, reload };
}
