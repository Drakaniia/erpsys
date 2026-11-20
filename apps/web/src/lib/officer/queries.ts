import { skipToken, useQuery } from "@tanstack/react-query";
import { api } from "$lib/api";
import { LAUNCH_STALE_MS } from "$lib/perf/cache-policy";
import { intervalWhileVisible } from "$lib/polling";
import type { StepCode } from "$lib/officer/types";
import type { OfficerTab } from "$lib/officer/tabs";

export interface OfficerQueryParams {
  authenticated: boolean;
  activeTab: OfficerTab;
  activeStep: StepCode | null;
  pageNum: number;
  pageSize: number;
  sortField: string;
  sortDir: string;
  searchQ: string;

  evidenceFilter: string;
  rangeFilter: string;
}

/**
 * React port of `createOfficerQueries` — same five queries, same polling.
 * Values are passed in on every render; TanStack keys off the queryKey the
 * caller builds, so a changed param re-fetches exactly as the runes did.
 */
export function useOfficerQueries(p: OfficerQueryParams) {
  const overviewQuery = useQuery(
    api.officer.getOverview.queryOptions({
      staleTime: LAUNCH_STALE_MS,
      enabled: p.authenticated,
      refetchInterval: intervalWhileVisible(20_000),
      refetchOnWindowFocus: true,
    }),
  );
  const bellQuery = useQuery(
    api.officer.getBell.queryOptions({
      input: { status: "PENDING", dir: "desc", pageSize: 20 },
      staleTime: LAUNCH_STALE_MS,
      enabled: p.authenticated,
      refetchInterval: intervalWhileVisible(20_000),
      refetchOnWindowFocus: true,
    }),
  );

  const listQuery = useQuery(
    api.officer.listByStep.queryOptions({
      input: p.activeStep
        ? {
            step: p.activeStep,
            page: p.pageNum,
            pageSize: p.pageSize,
            sort: p.sortField as never,
            dir: p.sortDir as never,
            q: p.searchQ,

            evidence: p.evidenceFilter as never,
            range: p.rangeFilter as never,
          }
        : skipToken,
      enabled: p.authenticated,
      refetchInterval: intervalWhileVisible(20_000),
      refetchOnWindowFocus: true,
    }),
  );

  const configurationVisible = (tab: OfficerTab) => ({
    enabled: p.authenticated && p.activeTab === tab,
    refetchOnMount: "always" as const,
    refetchInterval:
      p.activeTab === tab ? intervalWhileVisible(20_000) : intervalWhileVisible(0),
  });

  const profilingQuery = useQuery(
    api.officer.getProfilingForm.queryOptions({
      staleTime: LAUNCH_STALE_MS,
      ...configurationVisible("profiling-form"),
    }),
  );

  const linksQuery = useQuery(
    api.officer.listSocialMediaLinks.queryOptions({
      staleTime: LAUNCH_STALE_MS,
      ...configurationVisible("social-media-links"),
    }),
  );

  return { overviewQuery, bellQuery, listQuery, profilingQuery, linksQuery };
}
