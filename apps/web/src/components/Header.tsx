import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { authClient } from "$lib/auth-client";
import { homeRouteForRole } from "$lib/auth/redirect";
import {
  SURFACES_FOR_ROLE,
  type Role,
  type SurfaceId,
} from "$lib/domain/roles";
import UserMenu from "./UserMenu";

const SURFACE_DEFS: Record<
  SurfaceId,
  { label: string; route: "/student" | "/officer" | "/instructor" | "/admin" }
> = {
  student: { label: "Student", route: "/student" },
  officer: { label: "Officer", route: "/officer" },
  instructor: { label: "Instructor", route: "/instructor" },
  admin: { label: "Admin", route: "/admin" },
};

export default function Header() {
  const { data } = authClient.useSession();
  const location = useLocation();
  const navigate = useNavigate();
  const role = (data?.user as { role?: string } | undefined)?.role;
  const roleSurfaces = role ? (SURFACES_FOR_ROLE[role as Role] ?? []) : [];
  const hasSwitcher = roleSurfaces.length > 1;
  const currentPath = location.pathname;
  const homeLabel =
    role === "SBO_OFFICER"
      ? "Officer"
      : role === "ENROLLMENT_ADVISER"
        ? "Instructor"
        : role === "ADMIN"
          ? "Admin"
          : "Student";
  const activeSurface: SurfaceId | null = currentPath.startsWith("/admin")
    ? "admin"
    : currentPath.startsWith("/officer")
      ? "officer"
      : currentPath.startsWith("/instructor")
        ? "instructor"
        : currentPath.startsWith("/student")
          ? "student"
          : null;

  const [switcherOpen, setSwitcherOpen] = useState(false);
  const switcherEl = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!switcherOpen) return;
    function onPointerDown(e: PointerEvent) {
      if (
        switcherEl.current &&
        !switcherEl.current.contains(e.target as Node)
      ) {
        setSwitcherOpen(false);
      }
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setSwitcherOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [switcherOpen]);

  return (
    <div className="material sticky top-0 z-40 bg-chrome backdrop-blur-md">
      <div
        className={`mx-auto flex max-w-[1200px] flex-row items-center justify-between px-4 py-2.5 md:px-6 ${currentPath.startsWith("/admin") ? "md:max-w-[1440px]" : ""}`}
      >
        <nav className="flex gap-1 text-[15px]">
          {hasSwitcher ? (
            <div className="relative" ref={switcherEl}>
              <button
                aria-haspopup="menu"
                aria-expanded={switcherOpen}
                onClick={() => setSwitcherOpen((v) => !v)}
                className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-ink/70 transition-[transform,background-color] duration-100 ease-out hover:bg-surface hover:text-ink active:scale-[0.97]"
              >
                {activeSurface ? SURFACE_DEFS[activeSurface].label : homeLabel}
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                  className={switcherOpen ? "rotate-180" : ""}
                >
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </button>
              {switcherOpen && (
                <div
                  role="menu"
                  className="absolute left-0 z-50 mt-1 w-44 origin-top-left rounded-xl border border-border bg-surface-raised/90 p-1.5 shadow-[0_8px_24px_rgba(0,0,0,0.06),0_2px_8px_rgba(0,0,0,0.04)] backdrop-blur-md"
                  style={{ transformOrigin: "top left" }}
                >
                  {roleSurfaces.map((id) => {
                    const def = SURFACE_DEFS[id];
                    return (
                      <button
                        key={id}
                        role="menuitem"
                        onClick={() => {
                          setSwitcherOpen(false);
                          if (currentPath !== def.route) navigate(def.route);
                        }}
                        className={`flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm transition-[transform,background-color] duration-100 ease-out active:scale-[0.98] hover:bg-surface ${activeSurface === id ? "font-medium text-ink" : "text-muted hover:text-ink"}`}
                      >
                        {def.label}
                        {activeSurface === id && (
                          <span
                            className="h-1.5 w-1.5 rounded-full bg-primary"
                            aria-hidden="true"
                          />
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            <Link
              to={homeRouteForRole(role)}
              className="rounded-md px-3 py-1.5 text-ink/70 transition-[transform,background-color] duration-100 ease-out hover:bg-surface hover:text-ink active:scale-[0.97]"
            >
              {homeLabel}
            </Link>
          )}
        </nav>
        <div className="flex items-center gap-1.5">
          <UserMenu />
        </div>
      </div>
    </div>
  );
}
