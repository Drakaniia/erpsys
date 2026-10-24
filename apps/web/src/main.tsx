import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "react-router";
import "./app.css";
import { queryClient } from "$lib/api";
import { router } from "./app/router";
import AppToaster from "./components/ui/AppToaster";
import { initLaunchMetrics, markLaunch } from "$lib/perf/launch-metrics";
import {
  connectCacheLifecycle,
  restorePersistedCache,
} from "$lib/perf/persist";
import { prefetchLaunch } from "$lib/perf/launch-seed";
import { preloadSurfaceForPath } from "$lib/perf/preload-surface";

initLaunchMetrics();

async function boot(): Promise<void> {
  // Restore before the first render: `PersistQueryClientProvider` restores in
  // an effect, which is one paint too late for a warm launch.
  const restored = await restorePersistedCache();
  markLaunch("hydrated", { cached: restored });

  connectCacheLifecycle();
  preloadSurfaceForPath(window.location.pathname);
  // Concurrent with the session request the guards are about to make.
  void prefetchLaunch();

  createRoot(document.getElementById("app")!).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <AppToaster />
        <RouterProvider router={router} />
      </QueryClientProvider>
    </StrictMode>,
  );
}

void boot();
