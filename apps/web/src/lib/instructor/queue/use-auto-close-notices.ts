import { useState } from "react";
import type { DepartmentQueue } from "$lib/instructor/types";
import { AUTO_CLOSE_NOTICE_WINDOW_MS } from "./constants";

/**
 * Departments that were auto-closed by the idle sweep and still deserve a
 * notice, minus the ones the adviser has dismissed. Dismissals are keyed by
 * the auto-close time, so a later auto-close shows a fresh notice.
 */
export function useAutoCloseNotices(departments: DepartmentQueue[]) {
  const [acknowledged, setAcknowledged] = useState<string[]>(() => {
    try {
      return JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? "[]");
    } catch {
      return [];
    }
  });

  const keyOf = (d: DepartmentQueue) => `${d.id}:${d.autoClosedAt}`;

  const autoClosedDepts = departments.filter(
    (d) =>
      !d.myOpen &&
      d.autoClosedAt !== null &&
      Date.now() - new Date(d.autoClosedAt).getTime() <
        AUTO_CLOSE_NOTICE_WINDOW_MS &&
      !acknowledged.includes(keyOf(d)),
  );

  function dismissAutoClose(deptId: string) {
    const dept = departments.find((d) => d.id === deptId);
    if (!dept) return;
    setAcknowledged((prev) => {
      const next = [...prev, keyOf(dept)];
      try {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        /* storage unavailable */
      }
      return next;
    });
  }

  return { autoClosedDepts, dismissAutoClose };
}

const STORAGE_KEY = "instructor-auto-close-dismissed";
