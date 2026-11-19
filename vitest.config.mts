import { defineConfig } from "vitest/config";

/**
 * One vitest install for the whole workspace, two projects.
 *
 * Each entry is a package directory, so vitest picks up that package's own
 * Vite config. That matters for `apps/web`, whose config carries the `$lib`
 * alias the components import through.
 *
 * `server` is plain Node unit tests over the server's pure logic. `web` adds a
 * DOM (see apps/web/vite.config.ts) so React components can be rendered.
 */
export default defineConfig({
  test: {
    projects: ["apps/server", "apps/web"],
  },
});
