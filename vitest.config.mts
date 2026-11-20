import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      "apps/server",
      "apps/web",
      {
        test: {
          name: "load",
          environment: "node",
          include: ["load/**/*.test.mjs"],
        },
      },
    ],
  },
});
