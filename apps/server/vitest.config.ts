import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "server",
    environment: "node",
    env: { LOCAL_ONLY: "false" },
    include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
  },
});
