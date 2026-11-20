import path from "node:path";
import { Config } from "@remotion/cli/config";
import { enableTailwind } from "@remotion/tailwind-v4";

// Only the film bundle gets these adapters; Vite keeps the application's real services.
const file = (name: string) => path.resolve(process.cwd(), name);
Config.setEntryPoint("film/index.tsx");
Config.setPublicDir("film/public");
Config.overrideWebpackConfig((base) => {
  const config = enableTailwind(base);
  return {
    ...config,
    devtool: "source-map",
    optimization: { ...config.optimization, minimize: false },
    module: {
      ...config.module,
      rules: [
        ...(config.module?.rules ?? []),
        {
          test: /StudentTabBar\.tsx$/,
          enforce: "pre",
          loader: file("film/student-icons.cjs"),
        },
      ],
    },
    resolve: {
      ...config.resolve,
      extensionAlias: { ".js": [".ts", ".tsx", ".js"] },
      alias: {
        "@/components/charts/bar$": file("film/chart.tsx"),
        "$lib/ui/use-reduced-motion$": file("film/presence.ts"),
        ...config.resolve?.alias,
        "$lib/env$": file("film/env.ts"),
        "$lib/api$": file("film/api.ts"),
        "$lib/auth-client$": file("film/session.ts"),
        "$lib/student/state$": file("film/models.ts"),
        "$lib/officer/state$": file("film/models.ts"),
        "$lib/officer/detail-sheet$": file("film/models.ts"),
        "$lib/instructor/state$": file("film/models.ts"),
        "./queue-model$": file("film/models.ts"),
        "./admin-page/use-admin-console$": file("film/models.ts"),
        "$lib/ui/use-presence$": file("film/presence.ts"),
        "$lib/edit-timestamp$": file("film/presence.ts"),
        "$lib/officer/format$": file("film/format.ts"),
        $lib: file("src/lib"),
        "@": file("src"),
      },
    },
  };
});
