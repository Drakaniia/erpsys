import { useEffect, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import RoleChip from "./RoleChip";
import Pagination from "../ui/Pagination";
import FilterDropdown from "../ui/FilterDropdown";
import { api } from "$lib/api";
import { absoluteTime, initials, relativeTime } from "$lib/officer/format";

type AuditRow = {
  id: string;
  actorName: string;
  actorEmail: string;
  role: string;
  method: string;
  path: string;
  status: number;
  ip: string;
  at: string;
};

const ROLE_OPTIONS = [
  { value: "", label: "All roles" },
  { value: "STUDENT", label: "Student" },
  { value: "SBO_OFFICER", label: "SBO Officer" },
  { value: "ENROLLMENT_ADVISER", label: "Instructor" },
  { value: "ADMIN", label: "Admin" },
];

const METHOD_OPTIONS = [
  { value: "", label: "All actions" },
  { value: "POST", label: "Create" },
  { value: "PATCH", label: "Edit" },
  { value: "PUT", label: "Update" },
  { value: "DELETE", label: "Delete" },
];

const ACTION: Record<string, { label: string; className: string }> = {
  POST: { label: "Create", className: "border-primary/40 text-primary" },
  PATCH: { label: "Edit", className: "border-warning/40 text-warning" },
  PUT: { label: "Update", className: "border-warning/40 text-warning" },
  DELETE: { label: "Delete", className: "border-error/40 text-error" },
};

export default function AuditLogTable({
  registerrefresh = () => {},
}: {
  registerrefresh?: (fn: () => Promise<unknown> | void) => void;
}) {
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [role, setRole] = useState("");
  const [method, setMethod] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  useEffect(() => {
    const timer = setTimeout(() => {
      setQ(search.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const listQuery = useQuery(
    api.admin.listAuditLogs.queryOptions({
      input: {
        q: q || undefined,
        role: role || undefined,
        method: method || undefined,
        page,
        pageSize,
      },
      placeholderData: keepPreviousData,
      refetchOnWindowFocus: true,
    }),
  );
  const { refetch } = listQuery;
  useEffect(() => {
    registerrefresh(() => refetch());
  }, [registerrefresh, refetch]);

  const rows = (listQuery.data?.data ?? []) as AuditRow[];
  const total = listQuery.data?.total ?? 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.currentTarget.value)}
          placeholder="Search by name, email, or path"
          aria-label="Search audit log"
          className="min-w-[260px] flex-1 rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm text-ink placeholder:text-muted"
        />
        <FilterDropdown
          value={role}
          options={ROLE_OPTIONS}
          ariaLabel="Filter by role"
          onchange={(v: string) => {
            setRole(v);
            setPage(1);
          }}
        />
        <FilterDropdown
          value={method}
          options={METHOD_OPTIONS}
          ariaLabel="Filter by action"
          onchange={(v: string) => {
            setMethod(v);
            setPage(1);
          }}
        />
      </div>

      {listQuery.isError && (
        <div className="flex items-center justify-between gap-4 rounded-lg border border-error/30 bg-error/5 px-4 py-3">
          <p className="text-sm text-error">Could not load the audit log.</p>
          <button
            type="button"
            onClick={() => refetch()}
            className="rounded-lg border border-error/30 px-3 py-1.5 text-sm text-error transition-[transform,background-color] duration-100 ease-out hover:bg-error/5 active:scale-[0.97]"
          >
            Retry
          </button>
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-border bg-surface-raised">
        <div className="apple-scrollbar overflow-x-auto">
          <table className="w-full min-w-[900px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs font-medium text-muted">
                <th className="px-4 py-2 font-medium">When</th>
                <th className="px-2 py-2 font-medium">Who</th>
                <th className="px-2 py-2 font-medium">Role</th>
                <th className="px-2 py-2 font-medium">Action</th>
                <th className="px-2 py-2 font-medium">Target</th>
                <th className="px-4 py-2 text-right font-medium">Result</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {listQuery.isPending ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-14 text-center text-sm text-muted"
                  >
                    Loading…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-14 text-center text-sm text-muted"
                  >
                    No recorded actions match.
                  </td>
                </tr>
              ) : (
                rows.map((row) => {
                  const action = ACTION[row.method] ?? {
                    label: row.method,
                    className: "border-border text-muted",
                  };
                  const failed = row.status >= 400;
                  return (
                    <tr key={row.id} className="h-[52px] hover:bg-surface">
                      <td
                        className="whitespace-nowrap px-4 py-2 text-xs text-muted"
                        title={absoluteTime(row.at)}
                      >
                        {relativeTime(row.at)}
                      </td>
                      <td className="px-2 py-2">
                        <div className="flex min-w-0 items-center gap-3">
                          <span
                            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary"
                            aria-hidden="true"
                          >
                            {initials(row.actorName || row.actorEmail)}
                          </span>
                          <div className="min-w-0">
                            <p className="truncate font-medium text-ink">
                              {row.actorName || "—"}
                            </p>
                            <p className="truncate text-xs text-muted">
                              {row.actorEmail}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-2 py-2">
                        {row.role ? <RoleChip role={row.role} /> : "—"}
                      </td>
                      <td className="px-2 py-2">
                        <span
                          className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${action.className}`}
                        >
                          {action.label}
                        </span>
                      </td>
                      <td
                        className="max-w-[420px] truncate px-2 py-2 font-mono text-xs text-ink"
                        title={row.ip ? `${row.path} · ${row.ip}` : row.path}
                      >
                        {row.path.replace(/^\/api\/v1/, "")}
                      </td>
                      <td
                        className={`px-4 py-2 text-right text-xs tabular-nums ${failed ? "font-medium text-error" : "text-muted"}`}
                      >
                        {failed ? `Failed · ${row.status}` : row.status}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <Pagination
          page={page}
          pageSize={pageSize}
          total={total}
          totalPages={Math.max(1, Math.ceil(total / pageSize))}
          onpagechange={setPage}
          onpagesizechange={(n) => {
            setPageSize(n);
            setPage(1);
          }}
          label={(n) => `${n.toLocaleString()} action${n === 1 ? "" : "s"}`}
        />
      </div>
    </div>
  );
}
