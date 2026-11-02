import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { api, queryClient } from "$lib/api";
import { normalizeYearLevels, type YearLevel } from "$lib/domain/constants";
import type { AdviserItem, DepartmentItem } from "$lib/admin/types";

/**
 * The adviser roster, the department catalogue, and the per-adviser department
 * assignment editor (local selection until Save) plus the clear-all dialog.
 */
export function useAdviserMapping({
  ontoast,
  registerrefresh,
}: {
  ontoast: (message: string, kind?: "success" | "error") => void;
  registerrefresh?: (fn: () => Promise<unknown> | void) => void;
}) {
  const advisersQuery = useQuery(
    api.admin.listAdvisers.queryOptions({ refetchOnWindowFocus: true }),
  );
  const departmentsQuery = useQuery(
    api.admin.listDepartments.queryOptions({ refetchOnWindowFocus: true }),
  );
  const advisers: AdviserItem[] = advisersQuery.data?.data ?? [];
  const departments: DepartmentItem[] = (
    (departmentsQuery.data?.data ?? []) as DepartmentItem[]
  ).filter((d) => d.isActive);
  const { refetch: refetchAdvisers } = advisersQuery;
  const { refetch: refetchDepartments } = departmentsQuery;

  useEffect(() => {
    registerrefresh?.(async () => {
      await Promise.all([refetchAdvisers(), refetchDepartments()]);
    });
  }, [registerrefresh, refetchAdvisers, refetchDepartments]);

  const saveMutation = useMutation(
    api.admin.setAdviserDepartments.mutationOptions(),
  );

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["admin"] });
  }

  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedLevels, setSelectedLevels] = useState<
    Map<string, YearLevel[]>
  >(() => new Map());

  function openEditor(adviser: AdviserItem) {
    setEditingId(adviser.id);
    const next = new Map<string, YearLevel[]>();
    for (const d of adviser.departments) {
      next.set(d.id, normalizeYearLevels(d.yearLevels));
    }
    setSelectedLevels(next);
  }

  function setLevels(deptId: string, levels: YearLevel[]) {
    setSelectedLevels((prev) => {
      const next = new Map(prev);
      next.set(deptId, levels);
      return next;
    });
  }

  function toggleDept(deptId: string) {
    setSelectedLevels((prev) => {
      const next = new Map(prev);
      if (next.has(deptId)) next.delete(deptId);
      else next.set(deptId, []);
      return next;
    });
  }

  function assignments() {
    return [...selectedLevels.entries()].map(([departmentId, yearLevels]) => ({
      departmentId,
      yearLevels,
    }));
  }

  async function saveEditor() {
    if (!editingId) return;
    try {
      await saveMutation.mutateAsync({
        adviserId: editingId,
        assignments: assignments(),
      });
      ontoast("Adviser mapping updated");
      setEditingId(null);
      invalidate();
    } catch (e) {
      ontoast(
        e instanceof Error ? e.message : "Could not save mapping",
        "error",
      );
    }
  }

  const [clearing, setClearing] = useState<AdviserItem | null>(null);

  async function confirmClear() {
    if (!clearing) return;
    try {
      await saveMutation.mutateAsync({
        adviserId: clearing.id,
        assignments: [],
      });
      ontoast(`Removed all departments from ${clearing.name}`);
      setClearing(null);
      invalidate();
    } catch (e) {
      ontoast(
        e instanceof Error ? e.message : "Could not clear mapping",
        "error",
      );
      setClearing(null);
    }
  }

  return {
    advisers,
    departments,
    activeDepartments: editingId ? departments : [],
    isPending: advisersQuery.isPending,
    isError: advisersQuery.isError || departmentsQuery.isError,
    refetchAll: () => {
      advisersQuery.refetch();
      departmentsQuery.refetch();
    },
    editingId,
    selectedLevels,
    openEditor,
    setLevels,
    toggleDept,
    saveEditor,
    cancelEditor: () => setEditingId(null),
    clearing,
    setClearing,
    confirmClear,
    savePending: saveMutation.isPending,
  };
}
