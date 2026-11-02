import { Suspense, useEffect } from "react";
import { Outlet, useLocation } from "react-router";
import Header from "../components/Header";
import PageLoader from "../components/ui/PageLoader";
import { markLaunch } from "$lib/perf/launch-metrics";

const TITLES: Record<string, string> = {
  "/student": "Your Progress",
  "/queue": "Enrollment Queue",
  "/officer": "Officer Console",
  "/instructor": "Instructor Console",
  "/admin": "Admin Console",
};

export function AppLayout() {
  const { pathname, origin } = window.location;
  const title = TITLES[useLocation().pathname] ?? "ERPSYS";
  useEffect(() => {
    document.title = `${title} — ERPSYS`;
    let meta = document.querySelector<HTMLMetaElement>(
      'meta[name="description"]',
    );
    if (!meta) {
      meta = document.createElement("meta");
      meta.name = "description";
      document.head.appendChild(meta);
    }
    meta.content =
      "COT-SBO Enrollment Requirements Processing System — track your six-step enrollment stamps and queue status.";
    let link = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!link) {
      link = document.createElement("link");
      link.rel = "canonical";
      document.head.appendChild(link);
    }
    link.href = origin + pathname;
  }, [title, origin, pathname]);
  // The surface component renders on first data; this effect runs after that
  // paint, which is what the launch timeline calls `first-surface`.
  useEffect(() => {
    markLaunch("first-surface");
  }, [pathname]);
  return (
    <div className="grid h-svh grid-rows-[auto_1fr]">
      <Header />
      <main className="overflow-y-auto">
        <Suspense fallback={<PageLoader label="Loading console" />}>
          <Outlet />
        </Suspense>
      </main>
    </div>
  );
}

export function AuthLayout() {
  return (
    <Suspense fallback={<PageLoader label="Loading" />}>
      <Outlet />
    </Suspense>
  );
}
