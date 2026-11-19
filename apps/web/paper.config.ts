import path from "node:path";
import { Config } from "@remotion/cli/config";
import { enableTailwind } from "@remotion/tailwind-v4";

const file = (name: string) => path.resolve(process.cwd(), name);
Config.setEntryPoint("film/paper.tsx");
Config.setPublicDir("public");
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
          test: /(AuthShell|StudentTabBar)\.tsx$/,
          enforce: "pre",
          loader: file("film/paper-assets.cjs"),
        },
      ],
    },
    resolve: {
      ...config.resolve,
      extensionAlias: { ".js": [".ts", ".tsx", ".js"] },
      alias: {
        ...config.resolve?.alias,
        "$lib/env$": file("film/env.ts"),
        "$lib/api$": file("film/api.ts"),
        "$lib/auth-client$": file("film/session.ts"),
        "$lib/student/state$": file("film/models.ts"),
        "$lib/officer/state$": file("film/paper-models.ts"),
        "$lib/officer/detail-sheet$": file("film/models.ts"),
        "$lib/instructor/state$": file("film/paper-models.ts"),
        "./queue-model$": file("film/models.ts"),
        "./admin-page/use-admin-console$": file("film/models.ts"),
        "$lib/ui/use-presence$": file("film/presence.ts"),
        "$lib/ui/use-reduced-motion$": file("film/presence.ts"),
        "$lib/edit-timestamp$": file("film/presence.ts"),
        "$lib/officer/format$": file("film/format.ts"),
        $lib: file("src/lib"),
        "@": file("src"),
      },
    },
  };
});
