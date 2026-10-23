import path from "node:path";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";
import { ROUTES } from "./src/lib/api-routes.ts";

const appRoot = path.dirname(fileURLToPath(import.meta.url));
const monorepoRoot = path.resolve(appRoot, "../..");

const src = path.resolve(appRoot, "src").replace(/\\/g, "/");

const apiTarget = process.env.V2_API_TARGET ?? "http://localhost:3001";

/**
 * Every top-level REST resource prefix, derived from the hand-written client
 * URL table, so the proxy list cannot drift from the routes the server
 * mounts. All routes live under `/api`, so this currently yields just that.
 */
const restPrefixes = [
  ...new Set(
    Object.values(ROUTES)
      .flatMap(
        (procedures) =>
          Object.values(procedures) as unknown as {
            path: string;
            update?: { path: string };
          }[],
      )
      .flatMap((route) => [route.path, route.update?.path])
      .filter((routePath): routePath is string => Boolean(routePath))
      .map((routePath) => routePath.split("/").filter(Boolean)[0]!),
  ),
];

const escapeRegex = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Vendor chunks, split by package family. `pdfmake` is deliberately absent:
 * `lib/report/pdf.ts` owns its dynamic chunk. The returned name is also what
 * the bundle budget reads, so a new family must be added here to be visible.
 */
function vendorChunk(id: string): string | undefined {
  if (!id.includes("/node_modules/")) return undefined;
  if (id.includes("/pdfmake/")) return undefined;
  if (
    id.includes("/node_modules/react/") ||
    id.includes("/node_modules/react-dom/") ||
    id.includes("/node_modules/scheduler/")
  ) {
    return "react";
  }
  if (id.includes("/node_modules/react-router")) return "react-router";
  if (id.includes("/node_modules/@tanstack/")) return "tanstack";
  if (
    id.includes("/node_modules/better-auth/") ||
    id.includes("/node_modules/@better-auth/")
  ) {
    return "better-auth";
  }
  if (
    id.includes("/node_modules/marked/") ||
    id.includes("/node_modules/dompurify/")
  ) {
    return "markdown";
  }
  return undefined;
}

export default defineConfig(({ command }) => {
  // A new id per production build busts the persisted cache; dev keeps one id
  // so HMR restarts do not force a cold cache every time.
  const buildId =
    process.env.VITE_BUILD_ID ??
    (command === "build" ? Date.now().toString(36) : "dev");

  return {
    envDir: monorepoRoot,
    plugins: [tailwindcss(), react()],
    define: {
      __APP_BUILD_ID__: JSON.stringify(buildId),
    },
    resolve: {
      alias: [
        { find: "$lib", replacement: `${src}/lib` },
        { find: /^@\//, replacement: `${src}/` },
      ],
    },
    server: {
      port: 5173,
      /**
       * The REST surface lives under `/api`. `^` keys are regexes to Vite, and
       * `(/|$)` matches both `/api/students` and a bare `/api`.
       */
      proxy: {
        "/rpc": apiTarget,
        "/api": apiTarget,
        ...Object.fromEntries(
          restPrefixes.map((prefix) => [
            `^/${escapeRegex(prefix)}(/|$)`,
            { target: apiTarget },
          ]),
        ),
      },
    },
    build: {
      // The bundle-budget gate consumes the manifest.
      manifest: true,
      rollupOptions: {
        output: {
          manualChunks: vendorChunk,
        },
      },
    },
    test: {
      name: "web",
      environment: "jsdom",
      include: ["src/**/*.test.{ts,tsx}"],
      setupFiles: ["./test-setup.ts"],
    },
  };
});
