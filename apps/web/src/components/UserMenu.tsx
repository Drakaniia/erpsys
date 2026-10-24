import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { authClient } from "$lib/auth-client";
import { markSignedOut } from "$lib/auth/session-guard";
import { api, queryClient } from "$lib/api";
import { clearPersistedCache } from "$lib/perf/persist";
import { notify } from "$lib/notifications";
import { canEnterSurface } from "$lib/domain/roles";
import SignOutConfirm from "./SignOutConfirm";
import StampPanel from "./StampPanel";

type SignOutSnapshot = {
  code: string;
  name: string;
  myOpen: boolean;
  waitingCount: number;
  servingName: string | null;
  servingNumber: string | null;
};

export default function UserMenu() {
  const { data, isPending } = authClient.useSession();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [stampPanelOpen, setStampPanelOpen] = useState(false);
  const [signOutBusy, setSignOutBusy] = useState(false);
  const [signOutConfirmOpen, setSignOutConfirmOpen] = useState(false);
  const [signOutChecking, setSignOutChecking] = useState(false);
  const [signOutSnapshot, setSignOutSnapshot] =
    useState<SignOutSnapshot | null>(null);
  const menuEl = useRef<HTMLDivElement | null>(null);

  const user = data?.user as
    | { name?: string; email?: string; image?: string; role?: string }
    | undefined;
  const role = user?.role;
  const isOfficerSurface = canEnterSurface(role, "officer");
  const onStudentSurface = location.pathname.startsWith("/student");
  const showKeyboardGuide =
    (role === "SBO_OFFICER" || role === "ENROLLMENT_ADVISER") &&
    !onStudentSurface;

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (menuEl.current && !menuEl.current.contains(e.target as Node)) {
        setOpen(false);
        setStampPanelOpen(false);
      }
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        setStampPanelOpen(false);
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  if (isPending) {
    return <div className="h-8 w-24 animate-pulse rounded-lg bg-surface" />;
  }
  if (!user) {
    return (
      <button
        type="button"
        onClick={() => navigate("/login")}
        className="rounded-lg bg-primary px-3 py-1.5 text-sm text-white transition-transform duration-100 ease-out active:scale-[0.97]"
      >
        Sign In
      </button>
    );
  }

  const initial = (user.name ?? user.email ?? "?").slice(0, 1).toUpperCase();

  async function executeSignOut() {
    if (signOutBusy) return;
    setSignOutBusy(true);
    markSignedOut();
    // Cancel in-flight queries (e.g. /api/v1/me/overview) so they never fire
    // a 401 against the cleared cookie on the sign-out race.
    await queryClient.cancelQueries().catch(() => undefined);
    try {
      await authClient.signOut({
        fetchOptions: {
          onSuccess: () => {
            queryClient.clear();
            clearPersistedCache();
            navigate("/login?reason=signed-out", { replace: true });
          },
          onError: (error) => {
            console.error("Sign out failed:", error);
            notify.error("Could not sign out. Please try again.");
          },
        },
      });
    } finally {
      setSignOutBusy(false);
      setSignOutConfirmOpen(false);
    }
  }

  async function handleSignOut() {
    if (role !== "ENROLLMENT_ADVISER" && role !== "ADMIN") {
      await executeSignOut();
      return;
    }
    if (signOutChecking || signOutBusy) return;
    setSignOutChecking(true);
    try {
      const [deptRes, queuesRes] = await Promise.all([
        queryClient.fetchQuery(api.instructor.listDepartments.queryOptions()),
        queryClient.fetchQuery(api.instructor.getMyQueues.queryOptions()),
      ]);
      const items =
        (deptRes as { items?: unknown[]; data?: unknown[] }).items ??
        (deptRes as { data?: unknown[] }).data ??
        [];
      const assigned = (
        items as Array<{
          id: string;
          code: string;
          name: string;
          assigned: boolean;
        }>
      ).find((d) => d.assigned);
      if (!assigned) {
        await executeSignOut();
        return;
      }
      type QueueDept = {
        id: string;
        myOpen: boolean;
        waitingCount: number;
        servingEntry: { name: string; studentNumber: string } | null;
      };
      const qDept =
        (queuesRes as { departments: QueueDept[] }).departments.find(
          (d) => d.id === assigned.id,
        ) ?? null;
      const myOpen = qDept?.myOpen ?? false;
      const waitingCount = qDept?.waitingCount ?? 0;
      const serving = qDept?.servingEntry ?? null;
      const needsConfirm = myOpen || waitingCount > 0 || serving !== null;
      if (!needsConfirm) {
        await executeSignOut();
        return;
      }
      setSignOutSnapshot({
        code: assigned.code,
        name: assigned.name,
        myOpen,
        waitingCount,
        servingName: serving?.name ?? null,
        servingNumber: serving?.studentNumber ?? null,
      });
      setOpen(false);
      setStampPanelOpen(false);
      setSignOutConfirmOpen(true);
    } catch {
      await executeSignOut();
    } finally {
      setSignOutChecking(false);
    }
  }

  function handleOpenGuide() {
    setOpen(false);
    const isOfficer = location.pathname.startsWith("/officer");
    window.dispatchEvent(
      new CustomEvent(
        isOfficer ? "officer:open-guide" : "instructor:open-guide",
      ),
    );
  }

  return (
    <div className="relative" ref={menuEl}>
      <div className="flex items-center gap-3">
        <span
          className="hidden text-sm text-muted sm:inline"
          title={user.email}
        >
          {user.name || user.email?.split("@")[0] || "User"}
        </span>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label="Profile menu"
          className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full bg-primary text-sm font-medium text-white transition-transform duration-100 ease-out active:scale-[0.93]"
        >
          {user.image ? (
            <img
              src={user.image}
              alt={`${user.name || "User"}'s profile`}
              className="h-full w-full object-cover"
            />
          ) : (
            initial
          )}
        </button>
      </div>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-2 w-80 origin-top-right rounded-xl border border-border bg-surface-raised/90 p-2 shadow-[0_8px_24px_rgba(0,0,0,0.06),0_2px_8px_rgba(0,0,0,0.04)] backdrop-blur-md"
          style={{ transformOrigin: "top right" }}
        >
          <div className="px-3 pb-2 pt-2">
            <p className="truncate text-sm font-medium text-ink">{user.name}</p>
            <p className="truncate text-xs text-muted">{user.email}</p>
            {role && (
              <p className="mt-1 inline-block rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                {role.replaceAll("_", " ")}
              </p>
            )}
          </div>

          {isOfficerSurface && (
            <>
              <div className="mx-2 border-t border-border" />
              {!stampPanelOpen ? (
                <button
                  role="menuitem"
                  type="button"
                  onClick={() => setStampPanelOpen(true)}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-ink transition-[transform,background-color] duration-100 ease-out hover:bg-surface active:scale-[0.98]"
                >
                  My stamp
                </button>
              ) : (
                <StampPanel
                  open={stampPanelOpen}
                  isOfficerSurface={isOfficerSurface}
                  onclose={() => setStampPanelOpen(false)}
                />
              )}
              {showKeyboardGuide && (
                <div className="mx-2 border-t border-border" />
              )}
            </>
          )}

          {showKeyboardGuide && (
            <button
              role="menuitem"
              type="button"
              onClick={handleOpenGuide}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-ink transition-[transform,background-color] duration-100 ease-out hover:bg-surface active:scale-[0.98]"
            >
              Keyboard guide
            </button>
          )}

          <div className="mx-2 border-t border-border" />

          <button
            role="menuitem"
            type="button"
            onClick={() => void handleSignOut()}
            disabled={signOutChecking || signOutBusy}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-error transition-[transform,background-color] duration-100 ease-out hover:bg-error/5 active:scale-[0.98] disabled:opacity-50"
          >
            {signOutChecking ? (
              <>
                <span
                  className="h-3 w-3 animate-spin rounded-full border-2 border-error/30 border-t-error"
                  aria-hidden="true"
                />
                Checking…
              </>
            ) : (
              "Sign Out"
            )}
          </button>
        </div>
      )}

      {signOutConfirmOpen && signOutSnapshot && (
        <SignOutConfirm
          open={signOutConfirmOpen}
          snapshot={signOutSnapshot}
          busy={signOutBusy}
          checking={signOutChecking}
          onclose={() => setSignOutConfirmOpen(false)}
          onexecute={() => void executeSignOut()}
        />
      )}
    </div>
  );
}
