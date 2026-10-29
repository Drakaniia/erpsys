import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import UserBulkBar from "./UserBulkBar";
import UserRowDialogs from "./UserRowDialogs";
import UserTableSkeleton from "./UserTableSkeleton";
import UserFilters from "./UserFilters";
import UserTableRow from "./UserTableRow";
import Pagination from "../ui/Pagination";
import { authClient } from "$lib/auth-client";
import { api } from "$lib/api";

import { useUserAdmin } from "./use-user-admin";
import type { OutsideFilter, RoleFilter } from "$lib/admin/types";

export default function UserTable({
  q,
  role,
  outside,
  page,
  pageSize,
  onqchange,
  onrolechange,
  onoutsidechange,
  onpagechange,
  onpagesizechange,
  registerrefresh = () => {},
  ontoast,
}: {
  q: string;
  role: RoleFilter;
  outside: OutsideFilter;
  page: number;
  pageSize: number;
  onqchange: (q: string) => void;
  onrolechange: (role: RoleFilter) => void;
  onoutsidechange: (outside: OutsideFilter) => void;
  onpagechange: (page: number) => void;
  onpagesizechange: (size: number) => void;
  registerrefresh?: (fn: () => Promise<unknown> | void) => void;
  ontoast: (message: string, kind?: "success" | "error") => void;
}) {
  // ---- Query ----
  const listQuery = useQuery(
    api.admin.listUsers.queryOptions({
      input: { q, role, outside, page, pageSize, sort: "joined", dir: "desc" },
      refetchOnWindowFocus: true,
    }),
  );
  const { refetch } = listQuery;
  useEffect(() => {
    registerrefresh(() => refetch());
  }, [registerrefresh, refetch]);

  const items: any[] = listQuery.data?.data ?? [];
  const total = listQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const [selected, setSelected] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    if (!items.length) return;
    setSelected((prev) => {
      const next = new Set(prev);
      let changed = false;
      for (const id of prev) {
        if (!items.some((i) => i.id === id)) {
          next.delete(id);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  const allOnPageSelected =
    items.length > 0 && items.every((i) => selected.has(i.id));

  function toggleAll() {
    setSelected((prev) => {
      if (items.length > 0 && items.every((i) => prev.has(i.id))) {
        return new Set();
      }
      return new Set(items.map((i) => i.id));
    });
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const selectedItems = items.filter((i) => selected.has(i.id));
  const selectedPromotable = selectedItems.filter((i) => i.role === "STUDENT");
  const selectedDemotable = selectedItems.filter(
    (i) => i.role === "SBO_OFFICER",
  );

  const selectedDeletable = selectedItems.filter(
    (i) => !i.blocked && i.role !== "ADMIN",
  );

  const admin = useUserAdmin({
    selectedPromotable,
    selectedDemotable,
    selectedDeletable,
    selectedCount: selected.size,
    clearSelection: () => setSelected(new Set()),
    removeSelected: (id) =>
      setSelected((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      }),
    ontoast,
  });

  const sessionQuery = authClient.useSession();
  const myId =
    (sessionQuery.data?.user as { id?: string } | undefined)?.id ?? "";

  const [, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    function moveSelection(delta: number) {
      if (items.length === 0) return;
      setSelectedId((prev) => {
        const current = items.findIndex((i) => i.id === prev);
        const next = Math.min(
          items.length - 1,
          Math.max(
            0,
            current === -1
              ? delta > 0
                ? 0
                : items.length - 1
              : current + delta,
          ),
        );
        return items[next].id;
      });
    }
    function onKeydown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const typing =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);
      if (typing) return;
      if (admin.roleDialog || admin.deleteDialog || admin.purgeTarget) return;
      if (e.key === "j" || e.key === "ArrowDown") {
        e.preventDefault();
        moveSelection(1);
        return;
      }
      if (e.key === "k" || e.key === "ArrowUp") {
        e.preventDefault();
        moveSelection(-1);
        return;
      }
    }
    window.addEventListener("keydown", onKeydown);
    return () => window.removeEventListener("keydown", onKeydown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, admin.roleDialog, admin.deleteDialog, admin.purgeTarget]);

  return (
    <div className="flex flex-col gap-4">
      <UserFilters
        q={q}
        role={role}
        outside={outside}
        onqchange={onqchange}
        onrolechange={onrolechange}
        onoutsidechange={onoutsidechange}
        onrefresh={() => listQuery.refetch()}
        refreshing={listQuery.isFetching}
      />

      {listQuery.isError && (
        <div className="flex items-center justify-between gap-4 rounded-lg border border-error/30 bg-error/5 px-4 py-3">
          <p className="text-sm text-error">Could not load users.</p>
          <button
            type="button"
            onClick={() => listQuery.refetch()}
            className="rounded-lg border border-error/30 px-3 py-1.5 text-sm text-error transition-[transform,background-color] duration-100 ease-out hover:bg-error/5 active:scale-[0.97]"
          >
            Retry
          </button>
        </div>
      )}

      {/* Table (§6.1) */}
      <div className="overflow-hidden rounded-xl border border-border bg-surface-raised">
        <div className="apple-scrollbar overflow-x-auto">
          <table className="w-full min-w-[900px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs font-medium text-muted">
                <th className="w-10 px-4 py-2">
                  <input
                    type="checkbox"
                    checked={allOnPageSelected}
                    onChange={toggleAll}
                    aria-label="Select all on page"
                    className="h-4 w-4 accent-primary"
                  />
                </th>
                <th className="px-2 py-2 font-medium">User</th>
                <th className="px-2 py-2 font-medium tabular-nums">
                  Student #
                </th>
                <th className="px-2 py-2 font-medium">Role</th>
                <th className="px-2 py-2 font-medium">Org</th>
                <th className="px-2 py-2 font-medium">Joined</th>
                <th className="px-2 py-2 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {listQuery.isPending ? (
                <UserTableSkeleton />
              ) : items.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-14 text-center text-sm text-muted"
                  >
                    No users match.
                  </td>
                </tr>
              ) : (
                items.map((item) => (
                  <UserTableRow
                    key={item.id}
                    item={item}
                    myId={myId}
                    selected={selected.has(item.id)}
                    onToggle={toggleOne}
                    onSelectRow={setSelectedId}
                    admin={admin}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>

        <Pagination
          page={page}
          pageSize={pageSize}
          total={total}
          totalPages={totalPages}
          onpagechange={onpagechange}
          onpagesizechange={onpagesizechange}
          label={(n) => `${n.toLocaleString()} user${n === 1 ? "" : "s"}`}
        />
      </div>

      <UserBulkBar
        selectedCount={selected.size}
        promotableCount={selectedPromotable.length}
        demotableCount={selectedDemotable.length}
        deleteCount={selectedDeletable.length}
        onpromote={() => admin.askBulk("SBO_OFFICER")}
        ondemote={() => admin.askBulk("STUDENT")}
        ondelete={admin.askBulkDelete}
        onclear={() => setSelected(new Set())}
      />

      <UserRowDialogs
        roleDialog={admin.roleDialog}
        deleteDialog={admin.deleteDialog}
        purgeTarget={admin.purgeTarget}
        busy={admin.busy}
        selectedPromotableCount={admin.selectedPromotableCount}
        selectedDemotableCount={admin.selectedDemotableCount}
        selectedCount={admin.selectedCount}
        selectedDeletableCount={admin.selectedDeletableCount}
        onConfirmRole={admin.confirmRoleChange}
        onConfirmDelete={admin.confirmDelete}
        onConfirmPurge={admin.confirmPurge}
        onCloseRole={admin.closeRole}
        onCloseDelete={admin.closeDelete}
        onClosePurge={admin.closePurge}
      />
    </div>
  );
}
