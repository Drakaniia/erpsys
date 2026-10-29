import { useEffect, useState } from "react";
import { useForm } from "@tanstack/react-form";
import { z } from "zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { api } from "$lib/api";
import Skeleton from "../ui/Skeleton";

type SelectedUser = {
  id: string;
  name: string;
  email: string;
  studentNumber: string | null;
};

export default function PasswordManagement({
  ontoast,
  registerrefresh,
}: {
  ontoast: (message: string, kind?: "success" | "error") => void;
  registerrefresh: (fn: () => Promise<unknown> | void) => void;
}) {
  // Search state
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedUser, setSelectedUser] = useState<SelectedUser | null>(null);
  const [showResetModal, setShowResetModal] = useState(false);

  // Search users query
  const searchResult = useQuery(
    api.admin.searchUsersForPasswordReset.queryOptions({
      input: { q: searchQuery, page: 1, pageSize: 20 },
      enabled: searchQuery.length >= 2,
    }),
  );

  // Reset form
  const resetForm = useForm({
    defaultValues: { newPassword: "" },
    onSubmit: async ({ value }) => {
      if (!selectedUser) return;
      await resetPasswordMutation.mutateAsync({
        userId: selectedUser.id,
        newPassword: value.newPassword,
      });
    },
    validators: {
      onSubmit: z.object({
        newPassword: z
          .string()
          .min(8, "Password must be at least 8 characters"),
      }),
    },
  });

  // Reset password mutation
  const resetPasswordMutation = useMutation(
    api.admin.resetPassword.mutationOptions({
      onSuccess: (result) => {
        ontoast(result.message, "success");
        setShowResetModal(false);
        setSelectedUser(null);
        resetForm.reset();
      },
      onError: (error) => {
        ontoast(error.message || "Failed to reset password", "error");
      },
    }),
  );

  function selectUser(user: SelectedUser) {
    setSelectedUser(user);
    setShowResetModal(true);
  }

  function closeModal() {
    setShowResetModal(false);
    setSelectedUser(null);
    resetForm.reset();
  }

  // Register refresh handler
  const { refetch } = searchResult;
  useEffect(() => {
    registerrefresh(() => refetch());
  }, [registerrefresh, refetch]);

  return (
    <div className="space-y-6">
      {/* Search */}
      <div className="relative">
        <label htmlFor="user-search" className="sr-only">
          Search students
        </label>
        <div className="relative">
          <svg
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <input
            id="user-search"
            type="search"
            placeholder="Search by name, email, or student number..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.currentTarget.value)}
            className="h-11 w-full rounded-lg border border-auth-border bg-white pl-10 pr-4 text-[15px] text-auth-ink outline-none placeholder:text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-auth-blue"
          />
        </div>
      </div>

      {/* Results */}
      {searchQuery.length >= 2 ? (
        searchResult.isPending ? (
          <div
            className="overflow-hidden rounded-lg border border-auth-border"
            aria-hidden="true"
          >
            <table className="w-full">
              <thead>
                <tr className="border-b border-auth-border bg-gray-50">
                  <th className="px-4 py-3 text-left text-sm font-medium text-auth-ink">
                    Name
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-auth-ink">
                    Email
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-auth-ink">
                    Student #
                  </th>
                  <th className="px-4 py-3 text-right text-sm font-medium text-auth-ink">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody>
                {[0, 1, 2].map((i) => (
                  <tr
                    key={i}
                    className="border-b border-auth-border last:border-0"
                    style={{ "--skeleton-i": i } as React.CSSProperties}
                  >
                    <td className="px-4 py-3">
                      <Skeleton h="0.875rem" w="8rem" radius="0.25rem" />
                    </td>
                    <td className="px-4 py-3">
                      <Skeleton h="0.875rem" w="11rem" radius="0.25rem" />
                    </td>
                    <td className="px-4 py-3">
                      <Skeleton h="0.875rem" w="5rem" radius="0.25rem" />
                    </td>
                    <td className="px-4 py-3">
                      <Skeleton
                        h="1.875rem"
                        w="8rem"
                        radius="0.375rem"
                        className="ml-auto"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : searchResult.data?.data.length === 0 ? (
          <div className="flex items-center justify-center py-8">
            <p className="text-muted">No students found</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-auth-border">
            <table className="w-full">
              <thead>
                <tr className="border-b border-auth-border bg-gray-50">
                  <th className="px-4 py-3 text-left text-sm font-medium text-auth-ink">
                    Name
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-auth-ink">
                    Email
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-auth-ink">
                    Student #
                  </th>
                  <th className="px-4 py-3 text-right text-sm font-medium text-auth-ink">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody>
                {((searchResult.data?.data ?? []) as SelectedUser[]).map(
                  (user) => (
                    <tr
                      key={user.id}
                      className="border-b border-auth-border last:border-0 hover:bg-gray-50"
                    >
                      <td className="px-4 py-3 text-sm text-auth-ink">
                        {user.name}
                      </td>
                      <td className="px-4 py-3 text-sm text-muted">
                        {user.email}
                      </td>
                      <td className="px-4 py-3 text-sm text-muted">
                        {user.studentNumber ?? "-"}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => selectUser(user)}
                          className="rounded-md bg-auth-blue px-3 py-1.5 text-sm font-medium text-white transition-[transform,background-color] duration-100 ease-out hover:bg-auth-blue/90 active:scale-[0.97]"
                        >
                          Reset Password
                        </button>
                      </td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </div>
        )
      ) : (
        <div className="flex items-center justify-center py-8">
          <p className="text-muted">Enter at least 2 characters to search</p>
        </div>
      )}

      {/* Reset Password Modal */}
      {showResetModal && selectedUser && (
        <div
          className="modal-scrim fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0, 0, 0, 0.08)" }}
          onClick={closeModal}
          onKeyDown={(e) => e.key === "Escape" && closeModal()}
          role="dialog"
          aria-modal="true"
          aria-labelledby="reset-modal-title"
          tabIndex={-1}
        >
          <div
            className="w-full max-w-md rounded-xl bg-white p-6 shadow-[0_8px_32px_rgba(0,0,0,0.12)]"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            <h2
              id="reset-modal-title"
              className="text-lg font-semibold text-auth-ink"
            >
              Reset Password
            </h2>
            <p className="mt-1 text-sm text-muted">
              Set a new password for{" "}
              <strong className="text-auth-ink">{selectedUser.name}</strong>
            </p>

            <form
              className="mt-6 space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                e.stopPropagation();
                void resetForm.handleSubmit();
              }}
            >
              <resetForm.Field name="newPassword">
                {(field) => {
                  const rawErr = field.state.meta.isTouched
                    ? field.state.meta.errors[0]
                    : undefined;
                  const errorMessage =
                    rawErr === undefined
                      ? ""
                      : typeof rawErr === "string"
                        ? rawErr
                        : ((rawErr as { message?: string })?.message ?? "");
                  const hasError =
                    field.state.meta.isTouched && errorMessage.length > 0;
                  return (
                    <div className="space-y-1.5">
                      <label
                        htmlFor={field.name}
                        className="text-sm font-medium text-auth-ink"
                      >
                        New Password
                      </label>
                      <input
                        id={field.name}
                        name={field.name}
                        type="password"
                        autoComplete="new-password"
                        placeholder="Enter new password (min. 8 characters)"
                        className={`h-11 w-full rounded-md border bg-white px-3 text-[15px] text-auth-ink outline-none placeholder:text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-auth-blue ${
                          hasError ? "border-error" : "border-auth-border"
                        }`}
                        aria-invalid={hasError}
                        onBlur={field.handleBlur}
                        value={field.state.value}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                          field.handleChange(e.target.value);
                          field.setMeta((prev) => ({
                            ...prev,
                            errors: [],
                            isTouched: false,
                          }));
                        }}
                      />
                      {hasError && (
                        <p className="text-sm text-error">{errorMessage}</p>
                      )}
                    </div>
                  );
                }}
              </resetForm.Field>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeModal}
                  className="rounded-lg px-4 py-2 text-sm font-medium text-muted transition-[background-color,color] duration-100 ease-out hover:bg-gray-100 hover:text-ink active:scale-[0.97]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-auth-blue px-4 py-2 text-sm font-medium text-white transition-[transform,background-color] duration-100 ease-out hover:bg-auth-blue/90 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={resetPasswordMutation.isPending}
                >
                  {resetPasswordMutation.isPending
                    ? "Resetting..."
                    : "Reset Password"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
